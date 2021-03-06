var twilio = require('twilio');
var config = require('../../config.json');

// Find your account sid and auth token in your Twilio account Console.
var client = twilio(config.sms.accountSid, config.sms.authToken);

// Send the text message.
client.sendMessage({
    to: config.sms.toNumber,
    from: config.sms.fromNumber,
    body: 'Hello from Twilio!'
});
