//
// app.js - annotated as a learning exercise
//

//
// Define includes
//
var express = require('express');
var path = require('path');

var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var session = require('express-session');
var expressProxy = require('express-http-proxy');
var proxyMiddleware = require('http-proxy-middleware');
var HttpsProxyAgent = require('https-proxy-agent');
var url = require('url');

// Logging
var fs = require('fs');
var morgan = require('morgan');
var winston = require('winston');

//
// Load local configuration - the values loaded are only used if we are not
// running in the cloud
//
var environmentVars = require('./config.json');

//
// Declare routes - these code fragments define specific URIs to be handled by the server
//
var index = require('./routes/index');
var uaa = require('./routes/uaa');
var timeseries = require('./routes/timeseries');

//
// Setting up Express server
//
var app = express();
// Server will run on 3000 unless there's a CF environment variable that says otherwise.
// Normally CF will set this variable to 80.
var config = {
    express: {
        port: process.env.VCAP_APP_PORT || 3000
    }
};

// Set up the request logger - Morgan will log to the Node log files
app.use(morgan('combined'));

//Initializing application modules
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());

// Predix UAA information
var clientId = '';
var base64ClientCredential = '';
var uaaUri = ''; //Surely only one of these
var uaaURL = ''; //is needed

// Predix Asset service information
var assetMachine = '';
var assetTagname = '';
var assetURL = '';
var assetZoneId = '';

// Predix TimeSeries service information
var timeseriesZone = '';
var timeseriesURL = '';

//
// Initialize properties - checking NODE_ENV to determine if we are running
// in Cloud Foundry. If so, load cloud properties from VCAPS, otherwise
// load development properties from config.json
//
// Note that items in config.json are matched by exact name
//
var node_env = process.env.node_env || 'development';
if (node_env == 'development') {
    // Use config.json values
    var devConfig = environmentVars[node_env];
    winston.info("Development environment detected, initializing from config.json");

    clientId = devConfig.clientId;
    uaaUri = devConfig.uaaUri;
    base64ClientCredential = devConfig.base64ClientCredential;

    assetURL = devConfig.assetURL;
    assetZoneId = devConfig.assetZoneId;

    timeseriesZone = devConfig.timeseries_zone;
    timeseriesURL = devConfig.timeseriesURL;
} else {
    // Read VCAPS for values.
    // Variables defined in manifest.yml are exposed directly by name. Others are
    // extracted from service-specific sections in VCAP_SERVICES or the
    // application section VCAP_APPLICATION.
    winston.info("Cloud Foundry environment detected, initializing from VCAPS");

    var vcapServices = JSON.parse(process.env.VCAP_SERVICES);
    var vcapApplication = JSON.parse(process.env.VCAP_APPLICATION);

    var assetService = vcapServices['predix-asset'];
    var timeseriesService = vcapServices['predix-timeseries'];

    var uaaService = vcapServices[process.env.uaa_service_label];
    clientId = process.env.clientId;
    base64ClientCredential = process.env.base64ClientCredential;

    uaaUri = '';

    if (uaaService) {
        uaaUri = uaaService[0].credentials.issuerId;
    }

    if (assetService) {
        assetURL = assetService[0].credentials.uri + "/" + assetMachine;
        assetZoneId = assetService[0].credentials.zone["http-header-value"];
    }
    if (timeseriesService) {
        timeseriesZone = timeseriesService[0].credentials.query["zone-http-header-value"];
        timeseriesURL = timeseriesService[0].credentials.query.uri;
    }

}

// Setting the Predix UAA config used in the router auth.js
var uaaConfig = {
    clientId: clientId,
    serverUrl: uaaUri,
    defaultClientRoute: '/index.html',
    base64ClientCredential: base64ClientCredential
};

var timeSeriesConfig = {
    serverUrl: timeseriesURL,
    zoneId: timeseriesZone
};

var assetConfig = {
    serverUrl: assetURL,
    zoneId: assetZoneId
}

var logMessage = '************' + node_env + '******************\n'
        + 'uaaConfig.serverUrl = ' + uaaConfig.serverUrl + '\n'
        + 'uaaConfig.clientId = ' + uaaConfig.clientId + '\n'
        + 'uaaConfig.base64ClientCredential = ' + uaaConfig.base64ClientCredential + '\n'
        + 'timeSeriesConfig.serverUrl = ' + timeSeriesConfig.serverUrl + '\n'
        + 'timeSeriesConfig.zoneId = ' + timeSeriesConfig.zoneId + '\n'
        + 'assetConfig.serverUrl = ' + assetConfig.serverUrl + '\n'
        + 'assetConfig.zoneId = ' + assetConfig.zoneId + '\n'
        + '***************************'
    ;

winston.info(logMessage);

var server = app.listen(config.express.port, function () {
    var host = server.address().address;
    var port = server.address().port;
    winston.info('Server Started at ' + uaaConfig.appUrl);
});

app.get('/favicon.ico', function (req, res) {
    res.send('favicon.ico');
});

//
// Session management
// *** this session store in only development use redis for prod **
//
app.use(session({
        secret: 'predixsample',
        name: 'cookie_name',
        proxy: true,
        resave: true,
        saveUninitialized: true
    })
);



//
// Define location of static files (non-routed)
//
app.use(express.static(path.join(__dirname, 'public')));

//
// Define routes
//

// Entry point before authentication - process further as described in index.js
app.use('/', index);

// API proxies for AJAX calls from client
uaa.initialize(uaaConfig);
app.use('/api/uaa',uaa);

timeseries.initialize(timeSeriesConfig);
app.use('/api/timeseries',timeseries);

// callback endpoint to removeSession
app.get('/removeSession', function (req, res, next) {
    auth.deleteSession(req);
    res.redirect("/");
});

// Last route: fall through if nothing else matched (error 404)
// Catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

//
// Error handlers
//

// development error handler
// will print stacktrace
if (node_env === 'development') {
    app.use(function (err, req, res, next) {
        if (!res.headersSent) {
            res.status(err.status || 500);
            res.send({
                message: err.message,
                error: err
            });
        }
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    if (!res.headersSent) {
        res.status(err.status || 500);
        res.send({
            message: err.message,
            error: {}
        });
    }
});

module.exports = app;
