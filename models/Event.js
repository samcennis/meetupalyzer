var Mongoose = require('mongoose');

exports.EventSchema = new Mongoose.Schema({
    _id : { type: Number, required: true},
    announced_at : { type: Date, required: true},
    name: { type: String, required: true},
    urlname: { type: String, required: true},
    description : { type : String, required : true },
    yes_rsvp_count : { type: Number, required: true}

});