'use strict';

var mongoose = require('mongoose');

var quoteSchemaConfig = {
    symbol: {type: String, required: true},
    bidPrice: {type: Number, required: true},
    askPrice: {type: Number, required: true},
    lastPrice: {type: Number, required: true},
    timestamp: {type: Date, required: true},
    tradeVolume: {type: Number, required: true},
    cumulativeVolume: {type: Number, required: true},
    createdAt: {type: Date, required: true, default: Date.now}
};

var quoteSchema = mongoose.Schema(quoteSchemaConfig);

module.exports = mongoose.connection.model('quote', quoteSchema);
