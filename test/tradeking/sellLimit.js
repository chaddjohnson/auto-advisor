// Use the OAuth module
var oauth = require('oauth');

// Setup key/secret for authentication and API endpoint URL
var configuration = require('../../config.json').brokerage;

// Setup the OAuth Consumer
var tradeking_consumer = new oauth.OAuth(
    "https://developers.tradeking.com/oauth/request_token",
    "https://developers.tradeking.com/oauth/access_token",
    configuration.consumerKey,
    configuration.consumerSecret,
    "1.0",
    "http://mywebsite.com/tradeking/callback",
    "HMAC-SHA1"
);

// Create a sell stop limit order so that the positions sell once the price reaches a certain point.
var postData = '<FIXML xmlns="http://www.fixprotocol.org/FIXML-5-0-SP2">' +
               '  <Order TmInForce="1" Typ="2" Px="1.31" Side="2" Acct="' + configuration.accountId + '">' +
               '    <Instrmt SecTyp="CS" Sym="GSAT"/>' +
               '    <OrdQty Qty="1"/>' +
               '  </Order>' +
               '</FIXML>';

// Make a request to the API endpoint
tradeking_consumer.post(
    configuration.apiUrl + '/accounts/' + configuration.accountId + '/orders.json',
    configuration.accessToken,
    configuration.accessSecret,
    postData,
    'application/xml',
    function(error, data, response) {
        // Parse the JSON data
        order_data = JSON.parse(data);

        // Display the response
        console.log(JSON.stringify(order_data.response));
    }
);
