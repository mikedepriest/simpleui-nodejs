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
var index = require('./routes/index.js');
var secure = require('./routes/secure.js');
var auth = require('./routes/auth.js');

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

//
// Application specific declarations
//

// This application
var applicationUrl = '';

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

// remove?
var isConnectedTimeseriesEnabled = false;
var isConnectedAssetEnabled = false;

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

    applicationUrl = devConfig.appUrl;

    clientId = devConfig.clientId;
    uaaUri = devConfig.uaaUri;
    base64ClientCredential = devConfig.base64ClientCredential;

    assetTagname = devConfig.tagname;
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
    assetTagname = process.env.tagname;
    assetMachine = process.env.assetMachine;

    uaaUri = '';

    if (uaaService) {
        uaaUri = uaaService[0].credentials.uri;
    }

    if (assetService) {
        assetURL = assetService[0].credentials.uri + "/" + assetMachine;
        assetZoneId = assetService[0].credentials.zone["http-header-value"];
    }
    if (timeseriesService) {
        timeseriesZone = timeseriesService[0].credentials.query["zone-http-header-value"];
        timeseriesURL = timeseriesService[0].credentials.query.uri;
    }

    applicationUrl = 'https://' + vcapApplication.uris[0];

}

// Setting the Predix UAA config used in the router auth.js
var uaaConfig = {
    clientId: clientId,
    serverUrl: uaaUri,
    defaultClientRoute: '/index.html',
    base64ClientCredential: base64ClientCredential,
    callbackUrl: applicationUrl + '/callback',
    appUrl: applicationUrl
};

if (timeseriesURL != '') {
    isConnectedTimeseriesEnabled = true;
}

if (assetURL != '') {
    isConnectedAssetEnabled = true;
}

var connectedDeviceConfig = {
    assetTagname: assetTagname,
    assetURL: assetURL,
    assetZoneId: assetZoneId,
    timeseriesZone: timeseriesZone,
    timeseriesURL: timeseriesURL,
    uaaURL: uaaUri,
    uaaClientId: clientId,
    uaaBase64ClientCredential: base64ClientCredential,
    isConnectedTimeseriesEnabled: isConnectedTimeseriesEnabled,
    isConnectedAssetEnabled: isConnectedAssetEnabled
};
app.set('connectedDeviceConfig', connectedDeviceConfig);

var logMessage = '************' + node_env + '******************\n'
        + 'uaaConfig.clientId = ' + uaaConfig.clientId + '\n'
        + 'uaaConfig.serverUrl = ' + uaaConfig.serverUrl + '\n'
        + 'uaaConfig.defaultClientRoute = ' + uaaConfig.defaultClientRoute + '\n'
        + 'uaaConfig.base64ClientCredential = ' + uaaConfig.base64ClientCredential + '\n'
        + 'uaaConfig.callbackUrl = ' + uaaConfig.callbackUrl + '\n'
        + 'uaaConfig.appUrl = ' + uaaConfig.appUrl + '\n'
        + 'raspberryPiConfig.assetTagname = ' + connectedDeviceConfig.assetTagname + '\n'
        + 'raspberryPiConfig.assetURL = ' + connectedDeviceConfig.assetURL + '\n'
        + 'raspberryPiConfig.assetZoneId = ' + connectedDeviceConfig.assetZoneId + '\n'
        + 'raspberryPiConfig.timeseriesZone = ' + connectedDeviceConfig.timeseriesZone + '\n'
        + 'raspberryPiConfig.timeseriesURL = ' + connectedDeviceConfig.timeseriesURL + '\n'
        + 'raspberryPiConfig.uaaURL = ' + connectedDeviceConfig.uaaURL + '\n'
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

// callback endpoint to removeSession
app.get('/removeSession', function (req, res, next) {
    auth.deleteSession(req);
    res.redirect("/");
});

//Initializing auth.js modules with UAA configurations
app.use(auth.init(uaaConfig));

//
// Set up a proxy for calling the TimeSeries microservice from the client.
// Proxy uses http-proxy-middleware.
//
// Client will not know the Authorization information, so we provide that in
// the header, along with setting the content-type to application/json. This will
// also handle navigating a corporate proxy if one is present (although it's not clear how
// that will take place if the proxy requires authentication).
//
if (timeseriesURL) {
    var corporateProxyServer = process.env.http_proxy || process.env.HTTP_PROXY;
    var apiProxyContext = '/api';
    var apiProxyOptions = {
        target: timeseriesURL,
        changeOrigin: true,
        logLevel: 'debug',
        pathRewrite: {'^/api/services/timeseries': '/services/timeseries'},
        onProxyReq: function onProxyReq(proxyReq, req, res) {
            req.headers['Authorization'] = auth.getUserToken(req);
            req.headers['Content-Type'] = 'application/json';
            //winston.info('Request headers: ' + JSON.stringify(req.headers));
        }
    };
    if (corporateProxyServer) {
        apiProxyOptions.agent = new HttpsProxyAgent(corporateProxyServer);
    }

    app.use(proxyMiddleware(apiProxyContext, apiProxyOptions));
}

//
// Define location of static files (non-routed)
//
app.use(express.static(path.join(__dirname, 'public')));

//
// Define routes
//

// Entry point before authentication - process further as described in index.js
app.use('/', index);

// Entry point after authentication - process further as described in secure.js
app.use('/secure', secure);


function getTimeSeriesUrl(req) {
    winston.info('TimeSeries URL from configuration: ' + timeseriesURL);
    return timeseriesURL;
}

// using express-http-proxy, we can pass in a function to get the target URL for dynamic proxying:
app.use('/api', expressProxy(getTimeSeriesUrl, {
        https: true,
        forwardPath: function (req) {
            //  winston.info("Forwarding request: " + req.url);
            var forwardPath = url.parse(req.url).path;
            //  winston.info("forwardPath returns; " + forwardPath);
            return forwardPath;
        },
        decorateRequest: function (req) {
            req.headers['Content-Type'] = 'application/json';
            return req;
        }
    }
));

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
