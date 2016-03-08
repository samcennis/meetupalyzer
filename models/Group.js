var Mongoose = require('mongoose');

exports.GroupSchema = new Mongoose.Schema({
    _id : { type: Number, required: true},
    city : { type : String, required : true },
    country : { type : String, required : true },
    created : { type : Date, required : true },
    lat : { type : Number, required: true},
    link : { type: String, required: true},
    lon : { type : Number, required: true},
    members: { type: Number, required: true},
    name: { type: String, required: true},
    state: { type: String, required: true},
    description : { type : String, required : true },
    category_id : { type : Number, required : false },
    category_name : { type : String, required : false }
});