'use strict';

// Config
var config = require('../../config');

// Libraries
var mongoose = require('mongoose');
var OAuth = require('oauth').OAuth;
var _ = require('lodash');
var colors = require('colors');
var Quote = require('./quoteModel');

// Settings
var symbols = ['AMZN','AAPL','FB','MSFT','QQQ'];

// Set up the trading client.
var tradingClient = require('../../lib/tradingClients/base').factory('tradeking', config.brokerage);

// Stream data.
var stream = tradingClient.stream(symbols);

stream.on('data', function(data) {
    console.log(data);
});
stream.on('error', function(error) {
    console.error(error);
});
stream.on('close', function() {
    console.log('connection closed');
});
