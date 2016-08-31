//
// timeSeries.js - Route for UAA proxy AJAX calls
//
// Router should be initialized via initialize() with these values:
//
// serverUrl - the Predix UAA base URL for the application
// base64ClientCredential - the base64 encoding of the Predix client ID and client secret to be used
//
var express = require('express');
var router = express.Router();
var winston = require('winston');
var uaa = require('./uaa.js');

winston.info('Entering timeseries.js');

//
// Define defaults for UAA access
//
router.timeSeriesServerURL = '';
router.timeSeriesZoneId = '';

router.initialize = function(options) {
    winston.info('Initializing TimeSeries API options');
    router.timeSeriesServerURL = options.serverUrl;
    router.timeSeriesZoneId = options.zoneId;
};

router.getAccessToken = function() {
    return router.timeSeriesAccessToken;
};

// GET: Not implemented, return 405 Not Allowed
router.get('/', function (req, res, next) {
    res.status(405).send('GET Not Allowed'); // RFC 7231 Not Allowed
});

// POST without function: Not implemented, return 405 Not Allowed
router.post('/', function (req, res, next) {
    res.status(405).send('GET Not Allowed'); // RFC 7231 Not Allowed
});

// POST for  datapoints
router.post('/datapoints/:mode', function (req, res, next) {
    var request = require('request');
    winston.info('Request received:\n' + JSON.stringify(req.headers) + '\n' + JSON.stringify(req.body));
    if ( router.timeSeriesServerURL != '' ) {
        var suffix = '';
        if (req.params.mode == 'current') {
            suffix = '/latest';
        }
        var options = {
            method: 'POST',
            uri: router.timeSeriesServerURL+suffix,
            //uri: "http://requestb.in/10tp5gu1",
            headers: {
                "authorization": uaa.getAccessToken(),
                "predix-zone-id": router.timeSeriesZoneId,
                "Content-type": "application/json"
            },
            json: req.body
        };
        winston.info('Request forwarded with options: ' + JSON.stringify(options));
        request(options, function (error, response, body) {
            if (!error) {
                winston.info('Response received, code = ' + response.statusCode);
                winston.info('Response header = ' + JSON.stringify(response.header));
                winston.info('Response body = ' + JSON.stringify(body));
                res.send(body);
            } else {
                winston.info('Response received, error: ' + error.statusCode);
                res.send(error.statusCode);
            }
        })
    } else {
        res.status(500).send('Server not initialized correctly. Contact administrator.'); // RFC 7231 Internal Server Error
    }
});

module.exports = router;

winston.info('Exiting timeseries.js');
