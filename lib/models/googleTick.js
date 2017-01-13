'use strict';

var mongoose = require('mongoose');

var googleTickSchemaConfig = {
    symbol: {type: String, required: true},
    open: {type: Number, required: true},
    high: {type: Number, required: true},
    low: {type: Number, required: true},
    close: {type: Number, required: true},
    timestamp: {type: Date, required: true}
};

var googleTickSchema = mongoose.Schema(googleTickSchemaConfig);

module.exports = mongoose.connection.model('googleTick', googleTickSchema);
