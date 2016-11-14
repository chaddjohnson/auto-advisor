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

// Make a request to the API endpoint
// Manually update the access token/secret as parameters.  Typically this would be done through an OAuth callback when
// authenticating other users.
tradeking_consumer.get(configuration.apiUrl + '/accounts/' + configuration.accountId + '/holdings.json', configuration.accessToken, configuration.accessSecret, function(error, data, response) {
    // Parse the JSON data
    account_data = JSON.parse(data);

    // Display the response
    console.log(JSON.stringify(account_data.response));
});
