
/*
chrome.webRequest.onCompleted.addListener(function(details) {
    console.log(details);
}, {
    urls: ["<all_urls>"]
});
*/
var ports = {};

function isFunction(obj) {
  return !!(obj && obj.constructor && obj.call && obj.apply);
};

var Pipeline = function(){
  this.fns = new Array();
  this.index = 0;
}

Pipeline.prototype.Register = function(fn){
  if(isFunction(fn)){
    this.fns.push(fn);
  }
};

Pipeline.prototype.Clear = function(){
  this.fns.Clear();
}

Pipeline.prototype.Start = function(){
  this.index = 0;
  this.fns[this.index](this);
}

Pipeline.prototype.Next = function(){
  this.index++;
  this.fns[this.index](this);
}

var instaext = {
    Pipeline:{},
    Update: function(sendResponse){
        console.log('Start update');
       
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            //GotoHomePage > onEnd GetFollowersCount > onEnd GetFollowingsCount ...
            instaext.Pipeline = new Pipeline();

            instaext.Pipeline.Register(function(p){
                ports[tabs[0].id].postMessage({action: "GotoHomePage",callback:function(response) {
                  console.log(response);
                  p.Next();
                }});
                /*
                chrome.tabs.sendMessage(tabs[0].id, {action: "GotoHomePage"},function(response) {
                  console.log(response);
                  p.Next();
                });
                */
            });
            
            instaext.Pipeline.Register(function(p){
                ports[tabs[0].id].postMessage({action: "GetFollowersCount",callback:function(response) {
                  console.log("Followers Count:" +  response.Result);
                  p.Next();
                }});
                /*
                chrome.tabs.sendMessage(tabs[0].id, {action: "GetFollowersCount"},function(response) {
                  console.log("Followers Count:" +  response.Result);
                  p.Next();
                });
                */
            });

            instaext.Pipeline.Register(function(p){
                ports[tabs[0].id].postMessage({action: "GetFollowersCount",callback:function(response) {
                  console.log("Followings Count:" +  response.Result);
                  sendResponse({
                    msg: "on update!"
                  });
                }});
                /*
                chrome.tabs.sendMessage(tabs[0].id, {action: "GetFollowingsCount"},function(response) {
                  console.log("Followings Count:" +  response.Result);
                  sendResponse({
                    msg: "on update!"
                  });
                });
                */
            });

            instaext.Pipeline.Start();
            /*
            chrome.tabs.sendMessage(tabs[0].id, {action: "GotoHomePage"}, function(response) {
              console.log('event called!');
            });
            */
        });

        
    }
};
/*
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    switch (request.action){
      case "Update":
        instaext.Update(sendResponse);
        break;
    }
});
*/
chrome.runtime.onConnect.addListener(function(port) {
  ports[port.sender.tab.id] = port;
  port.onMessage.addListener(function(msg) {
    
  });
});