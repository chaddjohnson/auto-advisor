'use strict';

var mongoose = require('mongoose');

var tickSchemaConfig = {
    symbol: {type: String, required: true},
    bidPrice: {type: Number, required: true},
    askPrice: {type: Number, required: true},
    lastPrice: {type: Number, required: true},
    timestamp: {type: Date, required: true},
    tradeVolume: {type: Number, required: true},
    cumulativeVolume: {type: Number, required: true},
    createdAt: {type: Date, required: true, default: Date.now}
};

var tickSchema = mongoose.Schema(tickSchemaConfig);

module.exports = mongoose.connection.model('tick', tickSchema);
