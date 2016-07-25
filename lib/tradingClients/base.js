function Base(config) {
    if (!config || Object.keys(config).length === 0) {
        throw 'No config provided to trading client.';
    }
}

Base.prototype.getQuote = function(symbol) {
    return 'No implementation for quote().';
};

Base.prototype.getAccount = function() {
    return 'No implementation for account().';
};

Base.prototype.getBuyHistory = function(symbol) {
    return 'No implementation for getBuyHistory().';
};

Base.prototype.buy = function(symbol, quantity) {
    return 'No implementation for buy().';
};

Base.prototype.sell = function(symbol, quantity) {
    return 'No implementation for sell().';
};

Base.factory = function(name, config) {
    var fn = null;

    if (name.toLowerCase() === 'test') {
        fn = require('./test');
    }
    else if (name.toLowerCase() === 'tradeking') {
        fn = require('./tradeKing');
    }
    else {
        throw 'Invalid trading client ' + name;
    }

    return new fn(config);
};

module.exports = Base;
