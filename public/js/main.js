'use strict';

var html = new EJS({ url: 'index.ejs'}).render(data);

function ready() {
    $('select').material_select();
    
    var $topicSelect = $("#topicSelect");
    var $submitButton = $("#submitButton");

function _error(error) {
    console.log("Error!");
    /*var message = typeof error.responseJSON.error === 'string' ?
      error.responseJSON.error :
      'Error code ' + error.responseJSON.error.code + ': ' + error.responseJSON.error.message;
    console.log(message);*/
}

function getTopicId(topic) {
    $.post('/api/topic_id', {'topic': topic}, topicIdCallback)
     .fail(_error);
} 
    
function findGroupsByTopicId(topic_id) {
    $.post('/api/find/groups', {'topic_id': topic_id}, findGroupsByTopicIdCallback)
     .fail(_error);   
}
  
    
function topicIdCallback(data){
    if (data.topic_id != -1){
        findGroupsByTopicId(data.topic_id);
    }
    else {
        console.log("Did not get a valid topic id.");
    }
}

function findGroupsByTopicIdCallback(data){
    //console.log("find callback!!");
    //All the groups are in the data!!!
}
    
$submitButton.click(function() {
    //var text = $textArea.val();
    //getTopicId(text);
    getTopicId($topicSelect.val());
    
    /*var text = $textArea.val();
    $submittedTxt.html(text);
    $submittedTxt.show();
    $output.hide();
    $loading.show();
    getToneAnalysis(text);*/
}); 
    
    
}

$(document).ready(ready);