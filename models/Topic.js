var Mongoose = require('mongoose');

exports.TopicSchema = new Mongoose.Schema({
    _id: {
        type: Number
        , required: true
    }
    , name: {
        type: String
        , required: true
    }
});