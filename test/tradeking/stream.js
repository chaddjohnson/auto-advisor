var config = require('../../config.json');

// Use the OAuth module
var OAuth = require('oauth').OAuth;

var credentials = {
    consumer_key: config.brokerage.consumerKey,
    consumer_secret: config.brokerage.consumerSecret,
    access_token: config.brokerage.accessToken,
    access_secret: config.brokerage.accessSecret
};

var oa = new OAuth(null, null, credentials.consumer_key, credentials.consumer_secret, "1.0", null, "HMAC-SHA1");
var request = oa.get("https://stream.tradeking.com/v1/market/quotes?symbols=AMZN",
credentials.access_token,
credentials.access_secret);

request.on('response', function (response) {
    response.setEncoding('utf8');
    response.on('data', function(data) {
        console.log(data);
    });
});
request.end();
