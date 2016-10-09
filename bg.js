
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

function guidGenerator() {
    var S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

var PipelineService = {
  pipelines :{},
  Create:function(tabId,onend){
    var port = ports[tabId]; 
    this.pipelines[tabId] = new Pipeline(port,onend);
    return this.pipelines[tabId];
  },
  Callback:function(tabId,callbackId,response){
    this.pipelines[tabId].Invoke(callbackId,response);
  }
}

var Pipeline = function(port,onend){
  this.fns = new Array();
  this.index = 0;
  this.port = port;
  this.onend = onend || function(){};
}

Pipeline.prototype.Register = function(action,fn){
  this.fns.push({id:guidGenerator(),action:action,callback:fn});
  return this;
};

Pipeline.prototype.Start = function(){
  this.index = -1;
  return this.Next();
}
Pipeline.prototype.Invoke = function(callbackId,response){
  for(var i in this.fns){
    if(this.fns[i].id==callbackId){
      this.fns[i].callback(response);
      break;
    }
  }
  this.Next();
}

Pipeline.prototype.Next = function(){
  this.index++;
  if( this.index <this.fns.length){
    this.port.postMessage({action: this.fns[this.index].action,callbackId:this.fns[this.index].id});
  }else{
    this.onend();
  }
  return this;
}

function updateFollowers(nodes){
  var transaction = db.transaction(["followers"], "readwrite");
  /*
  chrome.storage.local.remove('followers');
  chrome.storage.local.set({'followers': nodes}, function() {
                              // Notify that we saved.
                              console.log('Settings saved');
                            });
                            */
  transaction.oncomplete = function(event) {
    alert("All done!");
  };

  transaction.onerror = function(event) {
    // Don't forget to handle errors!
  };

  var objectStore = transaction.objectStore("followers");
  for (var i in nodes) {
    var request = objectStore.add(nodes[i]);
    request.onsuccess = function(event) {

    };
  }
}

var instaext = {
    Pipeline:{},
    Update: function(sendResponse){;
       
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            //GotoHomePage > onEnd GetFollowersCount > onEnd GetFollowingsCount ...

            var pipeline = PipelineService.Create(tabs[0].id,sendResponse)

                          // .Register("GotoHomePage",function(response) {
                          //   console.log(response);
                          // })
                var nodes = []
                var recursiveGetFollowers = function(response){
                            //console.log("Open followers>"+response.Query);
                            var query = JSON.parse(JSON.parse(response.Query).responseText);
                            nodes = nodes.concat(query.followed_by.nodes);
                            if(query.status=="ok"&&query.followed_by.page_info.has_next_page){
                              pipeline.Register("GetNextFollowers",recursiveGetFollowers);
                            }else{
                              updateFollowers(nodes);
                            }
                          };

                pipeline.Register("GetFollowersCount",function(response) {
                            console.log("Followers Count:" +  response.Result);
                          })
                          .Register("GetFollowingsCount",function(response) {
                            console.log("Followings Count:" +  response.Result);
                          })
                          .Register("OpenFollowersDialog",recursiveGetFollowers)
                          .Start();
        });

        
    }
};

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    switch (request.action){
      case "Update":
        instaext.Update(sendResponse);
        break;
    }
});

chrome.runtime.onConnect.addListener(function(port) {
  ports[port.sender.tab.id] = port;
  chrome.pageAction.show(port.sender.tab.id);
  port.onMessage.addListener(function(msg) {
    if(msg.action!=undefined&&msg.action!=null){
      if(msg.action.indexOf("callback.")==0){
        PipelineService.Callback(port.sender.tab.id,msg.action.split('.')[1],msg.response);
      }else{
        
      }
    }
  });
});
var request = indexedDB.open('instaext', 2);
var db;
request.onerror = function(event) {
  alert("Why didn't you allow my web app to use IndexedDB?!");
};
request.onsuccess = function(event) {
  db = event.target.result;
  console.log('db succeeded');
};
request.onupgradeneeded = function(event) { 
  db = event.target.result;

  // Create an objectStore for this database
  var objectStore = db.createObjectStore("followers", { keyPath: "id" });
  objectStore.createIndex("username", "username", { unique: true });

};