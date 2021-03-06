var q = require('q');
var _ = require('lodash');
var request = require('request');
var Base = require('./base');

function Test(config) {
    this.constructor = Test;
    this.config = config;

    Base.call(this, config);
};

Test.prototype = Object.create(Base.prototype);

Test.prototype.getQuote = function(symbol) {
    var deferred = q.defer();

    request('http://localhost:5000/quotes/' + symbol, function(error, response, body) {
        if (error) {
            return deferred.reject(error);
        }

        try {
            var data = JSON.parse(body).response;
        }
        catch (error) {
            return deferred.reject(error);
        }

        deferred.resolve({
            datetime: data.quotes.quote.datetime,
            bidPrice: parseFloat(data.quotes.quote.bid),
            askPrice: parseFloat(data.quotes.quote.ask),
            lastPrice: parseFloat(data.quotes.quote.last),
            lastTradeDate: '',
            averageVolume: parseFloat(data.quotes.quote.adv_90),
            previousClosePrice: parseFloat(data.quotes.quote.pcls) || 0
        });
    });

    return deferred.promise;
};

Test.prototype.getAccount = function() {
    var deferred = q.defer();

    request('http://localhost:5000/accounts/' + this.config.accountId, function(error, response, body) {
        if (error) {
            return deferred.reject(error);
        }

        try {
            var data = JSON.parse(body).response;
        }
        catch (error) {
            return deferred.reject(error);
        }

        deferred.resolve({
            cash: parseFloat(data.accountbalance.money.cash),
            value: 0,  // TODO
            holdingCostBasis: parseFloat(data.accountholdings.holding.costbasis),
            holdingQuantity: parseFloat(data.accountholdings.holding.qty)
        });
    });

    return deferred.promise;
};

Test.prototype.getBuyHistory = function(symbol) {
    var deferred = q.defer();

    request('http://localhost:5000/accounts/' + this.config.accountId + '/history', function(error, response, body) {
        if (error) {
            return deferred.reject(error);
        }

        try {
            var data = JSON.parse(body).response;
        }
        catch (error) {
            return deferred.reject(error);
        }

        var filtered = _.filter(data.transactions.transaction, {
            activity: 'Trade',
            symbol: symbol,
            transaction: {side: '1'}
        });

        deferred.resolve(filtered);
    });

    return deferred.promise;
};

Test.prototype.buy = function(symbol, quantity) {
    var deferred = q.defer();
    var requestOptions = {
        url: 'http://localhost:5000/accounts/' + this.config.accountId + '/orders',
        method: 'POST',
        json: {
            type: 'BUY',
            symbol: symbol,
            qty: quantity
        }
    };

    request.post(requestOptions, function(error, response, body) {
        if (error) {
            return deferred.reject();
        }

        deferred.resolve();
    });

    return deferred.promise;
};

Test.prototype.sell = function(symbol, quantity, limit) {
    var deferred = q.defer();
    var requestOptions = {
        url: 'http://localhost:5000/accounts/' + this.config.accountId + '/orders',
        method: 'POST',
        json: {
            type: 'SELL',
            symbol: symbol,
            qty: quantity
        }
    };

    request.post(requestOptions, function(error, response, body) {
        if (error) {
            return deferred.reject();
        }

        deferred.resolve();
    });

    return deferred.promise;
};

module.exports = Test;
