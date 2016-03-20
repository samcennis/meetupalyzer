var Mongoose = require('mongoose');

exports.GroupSchema = new Mongoose.Schema({
    _id : { type: Number, required: true},
    name: { type: String, required: true},
    urlname: { type: String, required: true},
    description : { type : String, required : true },
    created : { type : Date, required : true },
    city : { type : String, required : true },
    country : { type : String, required : true },
    localized_country_name: { type : String, required : true },
    state: { type: String, required: true},
    lat : { type : Number, required: true},
    lon : { type : Number, required: true},
    members: { type: Number, required: true},
    timezone: { type: String, required: true},
});