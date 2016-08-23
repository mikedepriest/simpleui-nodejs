//
// secure.js - Route for secure entry points
//
// Evaluates all requests and returns 'unauthorized' if a token is not
// present in the current session.
//
// If a token is present,
//
var express = require('express');
var auth = require('./auth.js');
var path = require('path');
var winston = require('winston');
var router = express.Router();
var app = express();

winston.info('Entering secure.js');

router.use(function (req, res, next) {
    console.log('check for token valid? ' + auth.hasValidSession(req));
    if (auth.hasValidSession(req)) {
        next(); // continue down the route chain
    } else {
        next(res.sendStatus(403).send('Forbidden'));
    }
});

// If we get here the session has a current token

/* GET Secure resource */
router.get('/', function (req, res, next) {
    // Send the HTML for the secure application main page
    res.sendFile(path.join(__dirname + '/../public/index-polymer.html'));
});
 
/* GET Secure resource for data */
router.get('/data', function (req, res, next) {
    console.log('Accessing the secure section ...' + path.join(__dirname + '/secure.html'))
    res.json(req.app.get('connectedDeviceConfig'));
});

module.exports = router;

winston.info('Exiting secure.js');
