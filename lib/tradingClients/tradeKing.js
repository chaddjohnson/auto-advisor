var oauth = require('oauth');
var q = require('q');
var _ = require('lodash');
var Base = require('./base');

function TradeKing(config) {
    this.constructor = TradeKing;
    this.config = config;

    Base.call(this, config);

    // Setup the OAuth Consumer for interacting with the brokerage.
    this.client = new oauth.OAuth(
        'https://developers.tradeking.com/oauth/request_token',
        'https://developers.tradeking.com/oauth/access_token',
        this.config.consumerKey,
        this.config.consumerSecret,
        '1.0',
        'http://mywebsite.com/tradeking/callback',
        'HMAC-SHA1'
    );
}

TradeKing.prototype = Object.create(Base.prototype);

TradeKing.prototype.getQuote = function(symbol) {
    var deferred = q.defer();

    this.client.get(this.config.apiUrl + '/market/ext/quotes.json?symbols=' + symbol, this.config.accessToken, this.config.accessSecret, function(error, data, response) {
        if (error) {
            return deferred.reject(error);
        }

        try {
            var quoteData = JSON.parse(data).response;
        }
        catch (error) {
            return deferred.reject(error);
        }

        deferred.resolve({
            datetime: quoteData.quotes.quote.datetime,
            bidPrice: parseFloat(quoteData.quotes.quote.bid),
            askPrice: parseFloat(quoteData.quotes.quote.ask),
            lastPrice: parseFloat(quoteData.quotes.quote.last),
            averageVolume: parseFloat(quoteData.quotes.quote.adv_90),
            previousClosePrice: parseFloat(quoteData.quotes.quote.pcls)
        });
    });

    return deferred.promise;
};

TradeKing.prototype.getAccount = function() {
    var deferred = q.defer();

    this.client.get(this.config.apiUrl + '/accounts/' + this.config.accountId + '.json', this.config.accessToken, this.config.accessSecret, function(error, data, response) {
        if (error) {
            return deferred.reject(error);
        }

        try {
            var accountData = JSON.parse(data).response;
        }
        catch (error) {
            return deferred.reject(error);
        }

        deferred.resolve({
            cash: parseFloat(accountData.accountbalance.money.cash),
            margin: parseFloat(accountData.accountbalance.money.marginbalance),
            buyingPower: parseFloat(accountData.accountbalance.buyingpower.stock),
            dayTradingBuyingPower: parseFloat(accountData.accountbalance.buyingpower.daytrading),
            marketValue: parseFloat(accountData.accountholdings.holding.marketvalue),
            value: parseFloat(accountData.accountbalance.accountvalue),
            holdingCostBasis: parseFloat(accountData.accountholdings.holding.costbasis) || 0,
            holdingQty: parseFloat(accountData.accountholdings.holding.qty) || 0
        });
    });

    return deferred.promise;
};

TradeKing.prototype.getHoldings = function() {
    var deferred = q.defer();

    this.client.get(this.config.apiUrl + '/accounts/' + this.config.accountId + '/holdings.json', this.config.accessToken, this.config.accessSecret, function(error, data, response) {
        if (error) {
            return deferred.reject(error);
        }

        try {
            var holdingsData = JSON.parse(data).response.accountholdings.holding;
        }
        catch (error) {
            return deferred.reject(error);
        }

        var holdings = _.map(holdingsData, function(item) {
            return {
                symbol: item.instrument.sym,
                quantity: parseInt(item.qty),
                averagePrice: parseFloat(item.purchaseprice)
            };
        });

        deferred.resolve(holdings);
    });

    return deferred.promise;
};

TradeKing.prototype.getBuyHistory = function(symbol) {
    var deferred = q.defer();

    this.client.get(this.config.apiUrl + '/accounts/' + this.config.accountId + '/history.json?transactions=trade', this.config.accessToken, this.config.accessSecret, function(error, data, response) {
        if (error) {
            return deferred.reject(error);
        }

        try {
            var historyData = JSON.parse(data).response;
        }
        catch (error) {
            return deferred.reject(error);
        }

        var filtered = _.filter(historyData.transactions.transaction, {
            activity: 'Trade',
            symbol: symbol,
            transaction: {side: '1'}
        });

        deferred.resolve(filtered);
    });

    return deferred.promise;
};

TradeKing.prototype.buy = function(symbol, quantity) {
    var deferred = q.defer();
    var postData = '<FIXML xmlns="http://www.fixprotocol.org/FIXML-5-0-SP2">' +
                   '  <Order TmInForce="0" Typ="1" Side="1" Acct="' + this.config.accountId + '">' +
                   '    <Instrmt SecTyp="CS" Sym="' + symbol + '"/>' +
                   '    <OrdQty Qty="' + quantity + '"/>' +
                   '  </Order>' +
                   '</FIXML>';

    this.client.post(
        this.config.apiUrl + '/accounts/' + this.config.accountId + '/orders.json',
        this.config.accessToken,
        this.config.accessSecret,
        postData,
        'application/xml',
        function(error, data, response) {
            if (error) {
                return deferred.reject();
            }

            deferred.resolve();
        }
    );

    return deferred.promise;
};

TradeKing.prototype.sell = function(symbol, quantity, limit) {
    var deferred = q.defer();
    var postData = '<FIXML xmlns="http://www.fixprotocol.org/FIXML-5-0-SP2">' +
                   '  <Order TmInForce="0" Typ="' + (!!limit ? 2 : 1) + '" Side="2" Acct="' + this.config.accountId + '"' + (!!limit ? ' Px="' + limit + '"' : '') + '>' +
                   '    <Instrmt SecTyp="CS" Sym="' + symbol + '"/>' +
                   '    <OrdQty Qty="' + quantity + '"/>' +
                   '  </Order>' +
                   '</FIXML>';

    this.client.post(
        this.config.apiUrl + '/accounts/' + this.config.accountId + '/orders.json',
        this.config.accessToken,
        this.config.accessSecret,
        postData,
        'application/xml',
        function(error, data, response) {
            if (error) {
                return deferred.reject();
            }

            deferred.resolve();
        }
    );

    return deferred.promise;
};

TradeKing.prototype.streamQuotes = function(symbols) {
    if (!(symbols instanceof Array)) {
        symbols = [symbols];
    }

    return this.client.get('https://stream.tradeking.com/v1/market/quotes.json?symbols=' + symbols.join(','), this.config.brokerage.accessToken, this.config.brokerage.accessSecret);
};

module.exports = TradeKing;
