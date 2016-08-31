//
// uaa.js - Route for UAA proxy AJAX calls
//
// Router should be initialized via initialize() with these values:
//
// serverUrl - the Predix UAA base URL for the application
// base64ClientCredential - the base64 encoding of the Predix client ID and client secret to be used
//
var express = require('express');
var router = express.Router();
var winston = require('winston');

winston.info('Entering uaa.js');

//
// Define defaults for UAA access
//
router.uaaServerURL = '';
router.uaaBase64ClientCredential = '';
router.uaaAccessToken = '';
router.uaaRefreshToken = '';

router.initialize = function(options) {
    winston.info('Initializing UAA API options');
    router.uaaServerURL = options.serverUrl;
    router.uaaBase64ClientCredential = 'Basic '+options.base64ClientCredential;
};

router.getAccessToken = function() {
    return router.uaaAccessToken;
};

router.getRefreshToken = function() {
    return router.uaaRefreshToken;
};

router.setTokens = function(uaaResponseBody) {
    var responseBody = JSON.parse(uaaResponseBody);
    if (responseBody.access_token && responseBody.token_type) {
        winston.info('Setting access token from response');
        router.uaaAccessToken = responseBody.token_type+ ' ' +responseBody.access_token;
    }
    if (responseBody.refresh_token) {
        winston.info('Setting refresh token from response');
        router.uaaRefreshToken = uaaResponseBody.refresh_token;
    }
};

router.isLoggedIn = function() {
    return (router.uaaAccessToken != '');
};

// GET: Not implemented, return 405 Not Allowed
router.get('/', function (req, res, next) {
    res.status(405).send('GET Not Allowed'); // RFC 7231 Not Allowed
});

router.post('/', function (req, res, next) {
    var request = require('request');
    winston.info('Request received:\n' + JSON.stringify(req.headers) + '\n' + JSON.stringify(req.body));
    if ((router.uaaServerURL != '') && (router.uaaBase64ClientCredential != '')) {
        var options = {
            method: 'POST',
            uri: router.uaaServerURL,
            //uri: 'https://d7ecf063-bf96-414f-a3b7-7ac8dcc61617.predix-uaa.run.aws-usw02-pr.ice.predix.io/oauth/token',
            //uri: 'http://requestb.in/10tp5gu1',
            headers: {
                //"authorization": "Basic YXBwX2NsaWVudF9pZDpzZWNyZXQ=",
                "authorization": router.uaaBase64ClientCredential,
                "accept": "application/json, application/x-www-form-urlencoded"
            },
            form: req.body
        };
        winston.info('Request forwarded with options: ' + JSON.stringify(options));
        request(options, function (error, response, body) {
            if (!error) {
                winston.info('Response received, code = ' + response.statusCode);
                winston.info('Response header = ' + JSON.stringify(response.header));
                winston.info('Response body = ' + JSON.stringify(body));
                if (response.statusCode == 200) {
                    router.setTokens(body);
                    res.set('Content-Type', 'application/json');
                    res.send('{ "authorized" : "'+JSON.stringify(router.isLoggedIn())+'" }');
                } else {
                    res.set('Content-Type', 'application/json');
                    res.send(body);
                }
            } else {
                winston.info('Response received, error: ' + error.statusCode);
                res.send(error.statusCode);
            }
        })
    } else {
        res.status(500).send('Server not initialized correctly. Contact administrator.'); // RFC 7231 Internal Server Error
    }
});
//}

module.exports = router;

winston.info('Exiting uaa.js');
