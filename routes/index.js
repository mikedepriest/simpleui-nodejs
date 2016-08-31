//
// index.js - Route for initial entry point
//
// All routes return index.html, no middleware required
//
var express = require('express');
var router = express.Router();
var winston = require('winston');

winston.info('Entering index.js');

//module.exports = {

/* GET index page. */

router.use(function (req, res, next) {
    next();
});

router.get('/', function (req, res, next) {
    res.sendFile('index.html');
});

module.exports = router;

winston.info('Exiting index.js');
