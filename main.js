var s = document.createElement('script');
s.src = chrome.extension.getURL('inject.js');
s.onload = function () {
    this.remove();
};
(document.head || document.documentElement).appendChild(s);

var observeDOM = (function () {
    var MutationObserver = window.MutationObserver || window.WebKitMutationObserver,
        eventListenerSupported = window.addEventListener;

    return function (obj, callback) {
        if (obj === null) return;
        if (MutationObserver) {
            // define a new observer
            var obs = new MutationObserver(function (mutations, observer) {
                if (mutations[0].addedNodes.length || mutations[0].removedNodes.length)
                    callback(mutations);
            });
            // have the observer observe foo for changes in children
            obs.observe(obj, {
                childList: true,
                subtree: true
            });
        } else if (eventListenerSupported) {
            obj.addEventListener('DOMNodeInserted', callback, false);
            obj.addEventListener('DOMNodeRemoved', callback, false);
        }
    }
})();

var buffer = document.createElement('ul');
buffer.id= "_instaext";
document.documentElement.appendChild(buffer);

function guidGenerator() {
    var S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

function Execute(code,callback){
    "use strict";
    var id = guidGenerator();
     var li =  document.createElement('li');
    li.id = id;
    document.getElementById('_instaext').appendChild(li);
    observeDOM( li ,function(args){ 
        //console.log('dom changed: ' + args);
        callback(li.innerText);
        li.remove();
    });
    var script = document.createElement('script');
    script.textContent = '(' + code + ')("'+id+'")';
    (document.head || document.documentElement).appendChild(script);
    script.parentNode.removeChild(script);
}

function CheckPeriodically(testfn, fn, once) {
    once = once || 100;
    if (once == 0) {
        fn(false);
    } else {
        if (testfn()) {
            fn(true);
        } else {
            setTimeout(function () {
                CheckPeriodically(testfn, fn, once - 1);
            }, 100);
        }
    }
}

var instaext = {
    GotoHomePage: function (msg) {
        var profileLink = document.querySelector('#react-root>section>nav>div>div>div>div:nth-child(3)>div>div:nth-child(3)>a');
        if(profileLink!=null){
            var username;
            Execute(function(id){ window.GetViewerUsername(id);},function(result){ username = result; });
            profileLink.click();
            CheckPeriodically(function(){
                return window.location.pathname == '/'+ username +'/';
            },function(result){
                msg.callback({Result:result});
            });
        }else{
            msg.callback({Result:false});
        }
    },
    GetFollowersCount: function (msg) {
        var span = document.querySelector('#react-root>section>main>article>header>div:nth-child(2)>ul>li:nth-child(2)>a>span');
        if(span!=null){
            msg.callback({Result:span.textContent});
        }else{
            //error
            msg.callback({Result:0});
        }
    },
    GetFollowingsCount: function (msg) {
        var span = document.querySelector('#react-root>section>main>article>header>div:nth-child(2)>ul>li:nth-child(3)>a>span');
        if(span!=null){
            msg.callback({Result:span.textContent});
        }else{
            //error
            msg.callback({Result:0});
        }
    },
    OpenFollowersDialog: function (msg) {
        var a = document.querySelector('#react-root>section>main>article>header>div:nth-child(2)>ul>li:nth-child(2)>a');
        if(a!=null){
            var query;
            Execute(function(id){ window.RegisterRequest(id,'/query/');},function(result){ 
                query = result; 
            });
            a.click();
            CheckPeriodically(function(){
                return document.querySelector('div>div[role=dialog]>div:nth-child(2)>div>div:nth-child(2)>ul>li:last-child>div.spiSpinner')==null&&
                        document.querySelectorAll('div>div[role=dialog]>div:nth-child(2)>div>div:nth-child(2)>ul>li').length>0;
            },function(result){
                    msg.callback({Result:result,Query:query});
            });
        }else{
            msg.callback({Result:false,Query:null});
        }
    },
    GetNextFollowers: function(msg){
        var container = document.querySelector('div>div[role=dialog]>div:nth-child(2)>div>div:nth-child(2)');
        var query;
        Execute(function(id){ window.RegisterRequest(id,'/query/');},function(result){ 
                query = result; 
        });
        setTimeout(function(){
            container.scrollTop = container.scrollHeight;
            CheckPeriodically(function(){
                    return query != undefined;
                },function(result){
                        msg.callback({Result:result,Query:query});
                });
        },100);
    }
    
};

function executeFunctionByName(functionName, context , args ) {
    //var args = [].slice.call(arguments).splice(2);
    var namespaces = functionName.split(".");
    var func = namespaces.pop();
    for (var i = 0; i < namespaces.length; i++) {
        context = context[namespaces[i]];
    }
    return context[func].apply(context, [args]);
}

// listener
/*
chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (request.action !== undefined && instaext[request.action] !== undefined) {
            request.params = request.params || [];
            request.params.splice(0, 0, sendResponse);
            executeFunctionByName(request.action, instaext, request.params);
        }
    });
*/
var pageId = guidGenerator();
var port = chrome.runtime.connect({name: "page-"+pageId});
//port.postMessage({joke: "Knock knock"});
port.onMessage.addListener(function(msg) {
    if (msg.action !== undefined && instaext[msg.action] !== undefined) {
        msg.callback = function(response){
            port.postMessage({action:'callback.'+msg.callbackId,response:response});
        }
        executeFunctionByName(msg.action, instaext, msg);
    }
});
// Observe a specific DOM element:
/** */
observeDOM( document ,function(args){ 
    console.log('dom changed: ' + args);
});

