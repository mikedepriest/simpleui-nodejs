//
// auth.js - Route for authentication related entry points
//
// Returns middleware functions:
//
// init(options) - copy various parameters - invoked at startup
// getAccessTokenFromCode(authCode,successCallback,errorCallback)
// getMiddlewares()
// hasValidSession()
// getUserToken()
// deleteUserSession()
//
//
var qs = require('querystring');
var url = require('url');
var rewriteModule = require('http-rewrite-middleware');
var request = require('request');
var session = require('express-session');
var winston = require('winston');

winston.info('Entering auth.js');

module.exports = {

    init: function (options) {
        options = options;
        this.clientId = options.clientId;
        this.serverUrl = options.serverUrl;
        this.defaultClientRoute = options.defaultClientRoute;
        this.base64ClientCredential = options.base64ClientCredential;
        this.user = null;
        this.callbackUrl = options.callbackUrl;
        this.appUrl = options.appUrl;
        return this.getMiddlewares();
    },

    getAccessTokenFromCode: function (authCode, successCallback, errorCallback) {
        var request = require('request');
        var self = this;
        var options = {
            method: 'POST',
            url: this.serverUrl + '/oauth/token',
            form: {
                'grant_type': 'authorization_code',
                'code': authCode,
                'redirect_uri': this.callbackUrl,
                'state': this.defautClientRoute
            },
            headers: {
                'Authorization': 'Basic ' + this.base64ClientCredential
            }
        };

        request(options, function (err, response, body) {
            if (!err && response.statusCode == 200) {
                var res = JSON.parse(body);
                var accessToken = res.token_type + ' ' + res.access_token;

                //
                // Request user information from Predix UAA
                //
                request({
                        method: 'post',
                        url: self.serverUrl + '/check_token',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Authorization': 'Basic ' + self.base64ClientCredential
                        },
                        form: {
                            'token': res.access_token
                        }
                    },
                    function (error, response, body) {
                        self.user = JSON.parse(body);
                        successCallback(accessToken);
                    }
                );

            }
            else {
                errorCallback(body);
            }
        });
    },

    getMiddlewares: function () {
        // Return handlers for calls to /callback, /login and /logout
        // /login: change request to invoke the Predix login screen, then return to the callback URL on success
        // /logout: change request to the /removeSession URL
        // /callback: retrieve the response from the Predix login screen and if it was sucessful,
        //            extract the authorization token and return to the /secure URL
        var middlewares = [];

        var uaa = this;
        var rewriteMiddleware = rewriteModule.getMiddleware([
                {
                    from: '^/login(.*)$',
                    to: uaa.serverUrl + '/oauth/authorize$1&response_type=code&scope=&client_id=' + uaa.clientId + '&redirect_uri=' + encodeURIComponent(uaa.callbackUrl),
                    redirect: 'permanent'
                },
                {
                    from: '^/logout(.*)$',
                    to: uaa.serverUrl + '/logout?&redirect=' + encodeURIComponent(uaa.appUrl + '/removeSession?state=logout'),
                    redirect: 'permanent'
                }
            ]
        );

        middlewares.push(function (req, res, next) {
            if (req.url.match('/callback')) {
                var params = url.parse(req.url, true).query;
                uaa.getAccessTokenFromCode(params.code,
                    function (token) {
                        // Save the extracted token for later use
                        req.session.token = token;
                        // Set the return destination
                        params.state = params.state || '/secure';
                        var url = req._parsedUrl.pathname.replace("/callback", params.state);

                        res.statusCode = 301; // "moved permanently"
                        res.setHeader('Location', url);
                        res.end();
                    },
                    function (err) {
                        // Token wasn't available, move down the route chain to the error handler
                        next(err);
                    }
                );
            }
            else {
                // Not what we were expecting, move down the route chain
                next();
            }
        });

        middlewares.push(rewriteMiddleware);

        return middlewares;
    },
    hasValidSession: function (req) {
        var sess = req.session;
        //console.log("Session token is "+sess.token);
        return !!sess.token;
    },
    getUserToken: function (req) {
        var sess = req.session;
        return sess.token;
    },
    deleteSession: function (req) {
        req.session.destroy();
    }
};

winston.info('Exiting auth.js');

