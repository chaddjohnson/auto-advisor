var twilio = require('twilio');

// Send the text message.
function Sms(config) {
    this.config = config;
    this.client = twilio(this.config.accountSid, this.config.authToken);
}

Sms.prototype.send = function(toNumber, message) {
    if (process.env.NODE_ENV !== 'production') {
        // Only send messages in production mode.
        return;
    }

    this.client.sendMessage({
        to: toNumber,
        from: this.config.fromNumber,
        body: message
    });
};

module.exports = Sms;
