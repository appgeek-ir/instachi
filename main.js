//تزریق اسکریپت به صفحه اصلی
var s = document.createElement('script');
s.src = chrome.extension.getURL('inject.js');
s.onload = function () {
    this.remove();
};
(document.head || document.documentElement).appendChild(s);

// تابع نظارت بر دام
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

// بافر
var buffer = document.createElement('ul');
buffer.id = "_instaext";
document.documentElement.appendChild(buffer);

function idGenerator() {
    var S4 = function () {
        return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
    };
    return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
}

//اجرای دستور در صفحه
function Execute(code, callback,args) {
    "use strict";
    var id = idGenerator();
    var li = document.createElement('li');
    li.id = id;
    document.getElementById('_instaext').appendChild(li);
    observeDOM(li, function (args) {
        //console.log('dom changed: ' + args);
        callback(li.innerText);
        li.remove();
    });
    args = args || {};
    var script = document.createElement('script');
    script.textContent = '(' + code + ')("' + id + '",'+ JSON.stringify(args) +')';
    (document.head || document.documentElement).appendChild(script);
    script.parentNode.removeChild(script);
}

//اجرای عملیات بر اساس محقق شدن شرط
function checkPeriodically(testfn, fn, once) {
    once = once || 100;
    if (once == 0) {
        fn(false);
    } else {
        if (testfn()) {
            fn(true);
        } else {
            setTimeout(function () {
                checkPeriodically(testfn, fn, once - 1);
            }, 100);
        }
    }
}

function isFunction(obj) {
  return !!(obj && obj.constructor && obj.call && obj.apply);
};

function clog(){
  for(var i in arguments){
    console.log(arguments[i]);
  }
}

// اتصال به کدهای پشتی
var pageId = idGenerator();
var port;

setTimeout(function(){
    port = chrome.runtime.connect({
        name: "page." + pageId
    });
    port.onMessage.addListener(function (msg) {
        if (msg.action !== undefined && controller[msg.action] !== undefined) {
            if (controller[msg.action] !== undefined) {
                controller[msg.action](msg);
            }
        }
    });
},1000);

//ارسال پاسخ
function postCallback(id, msg) {
    msg.action = "callback." + id;
    port.postMessage(msg);
}

//کنترلر صفحه
var controller = {
    /*
     * رفتن به صفحه پروفایل کاربر
     * صفحه مجددا لود می شود
     * username : نام کاربر
     */
    gotoProfile: function (msg) {
        clog('go to profile request:', msg);
        window.location.href = '/' + msg.username + '/';
    },

    /*
     * رفتن به صفحه اصلی
     * id: شناسه بازگشت
     */
    gotoHomePage: function (msg) {
        /*
        var profileLink = document.querySelector('#react-root>section>nav>div>div>div>div:nth-child(3)>div>div:nth-child(3)>a');
        if (profileLink != null) {
            var username;
            Execute(function (id) {
                window.getViewerUsername(id);
            }, function (result) {
                username = result;
            });
            profileLink.click();
            checkPeriodically(function () {
                return window.location.pathname == '/' + username + '/';
            }, function (result) {
                postCallback(msg.callbackId, {
                    result: true
                });
            });
        } else {
            postCallback(msg.callbackId, {
                result: false
            });
        }*/
        var profileLink = document.querySelector('#react-root>section>nav>div>div>div>div:nth-child(3)>div>div:nth-child(3)>a');
        if(profileLink!=null){
            window.location.href=profileLink.getAttribute('href');
        }else{

        }
    },

    getFollowersCount: function (msg) {
        var span = document.querySelector('#react-root>section>main>article>header>div:nth-child(2)>ul>li:nth-child(2)>a>span');
        if (span != null) {
            msg.callback({
                Result: span.textContent
            });
        } else {
            //error
            msg.callback({
                Result: 0
            });
        }
    },
    getFollowingsCount: function (msg) {
        var span = document.querySelector('#react-root>section>main>article>header>div:nth-child(2)>ul>li:nth-child(3)>a>span');
        if (span != null) {
            msg.callback({
                Result: span.textContent
            });
        } else {
            //error
            msg.callback({
                Result: 0
            });
        }
    },

    /**
     * باز کردن پنجره فالورهای صفحه
     * id: //
     */
    openFollowers: function (msg) {
        clog('open followers requested',msg);
        var a = document.querySelector('#react-root>section>main>article>header>div:nth-child(2)>ul>li:nth-child(2)>a');
        if (a != null) {
            var query;
            Execute(function (id) {
                console.log(window);
                window.registerRequest(id, '/query/');
            }, function (result) {
                query = JSON.parse(result);
                clog('query result selected:',query);
            });
            a.click();
            checkPeriodically(function () {
                return document.querySelector('div>div[role=dialog]>div:nth-child(2)>div>div:nth-child(2)>ul>li:last-child>div.spiSpinner') == null &&
                    document.querySelectorAll('div>div[role=dialog]>div:nth-child(2)>div>div:nth-child(2)>ul>li').length > 0;
            }, function (result) {
                clog('condition is ok');
                postCallback(msg.callbackId, {
                    result: result,
                    response: query
                });
            });
        } else {
            postCallback(msg.callbackId, {
                result: false
            });
        }
    },
    /**
    * لود بیشتر فالورها بوسیله اسکرول
    * id: //
    */
    loadMoreFollowers: function (msg) {
        var container = document.querySelector('div>div[role=dialog]>div:nth-child(2)>div>div:nth-child(2)');
        var query;
        Execute(function (id) {
            window.registerRequest(id, '/query/');
        }, function (result) {
            //امکان وجود خطا
            query = JSON.parse(result);
        });
        setTimeout(function () {
            container.scrollTop = container.scrollHeight;
            checkPeriodically(function () {
                return query != undefined;
            }, function (result) {
                postCallback(msg.callbackId, {
                    result: result,
                    response: query
                });
            });
        }, 100);
    },
    /**
     * فالو کردن کاربر از لیست باز شده
     * callbackId: //
     * userId: شناسه کاربر
     * username: نام کاربر
     */
    followFromList: function(msg){
        var userLink = document.querySelector('div>div[role=dialog]>div:nth-child(2)>div>div:nth-child(2)>ul>li a[title="'+msg.username+'"]');
        if(userLink!=null){
            var button = userLink.parentElement.parentElement.parentElement.parentElement.querySelector('button');
            if(button!=null){
                Execute(function (id,args) {
                    window.registerRequest(id, '/web/friendships/'+args.userId+'/follow/');
                }, function (result) {
                    //امکان وجود خطا
                    clog('follow from list completed:',result);
                    query = JSON.parse(result);
                    postCallback(msg.callbackId,{result:true,response:query});
                },{userId:msg.userId});
                button.click();
            }else{
                clog('follow from list:button not found');
                postCallback(msg.callbackId,{result:false});
            }
        }else{
            clog('follow from list:user not found');
            postCallback(msg.callbackId,{result:false});
        }
    },
    getCurrentPage: function(msg){
        clog('get current page request:', msg)
        var profileLink = document.querySelector('span>section>main>article>header>div:nth-child(2)>div>h1');
        if(profileLink!=null){
            clog('get current page:found: ', profileLink.innerText);
            postCallback(msg.callbackId,{result:true,username:profileLink.innerText});
        }else{
            clog('get current page:not found:');
            postCallback(msg.callbackId,{result:false});
        }
    },
    /**
     * دریافت اطلاعات کاربر لاگین کرده
     */
    getCurrentUser: function(msg){
        clog('get current user request:', msg)
        Execute(function (id) {
            window.getViewer(id);
        }, function (result) {
            //امکان وجود خطا
            user = JSON.parse(result);
            postCallback(msg.callbackId,{result:true,user:user});
        });
    },

    /**
     * باز کردن لیست فالوینگ ها
     */
    openFollowings: function(msg){
        clog('open followings request',msg);
        var a = document.querySelector('#react-root>section>main>article>header>div:nth-child(2)>ul>li:nth-child(3)>a');
        if (a != null) {
            var query;
            Execute(function (id) {
                console.log(window);
                window.registerRequest(id, '/query/');
            }, function (result) {
                query = JSON.parse(result);
                clog('query result selected:',query);
            });
            a.click();
            checkPeriodically(function () {
                return document.querySelector('div>div[role=dialog]>div:nth-child(2)>div>div:nth-child(2)>ul>li:last-child>div.spiSpinner') == null &&
                    document.querySelectorAll('div>div[role=dialog]>div:nth-child(2)>div>div:nth-child(2)>ul>li').length > 0;
            }, function (result) {
                clog('condition is ok');
                postCallback(msg.callbackId, {
                    result: result,
                    response: query
                });
            });
        } else {
            postCallback(msg.callbackId, {
                result: false
            });
        }
    },

    /**
     * لود فالوینگ های بیشتر
     */
    loadMoreFollowings: function (msg) {
        var container = document.querySelector('div>div[role=dialog]>div:nth-child(2)>div>div:nth-child(2)');
        var query;
        Execute(function (id) {
            window.registerRequest(id, '/query/');
        }, function (result) {
            //امکان وجود خطا
            query = JSON.parse(result);
        });
        setTimeout(function () {
            container.scrollTop = container.scrollHeight;
            checkPeriodically(function () {
                return query != undefined;
            }, function (result) {
                postCallback(msg.callbackId, {
                    result: result,
                    response: query
                });
            });
        }, 100);
    },

    /**
     * آنفالو کردن از لیست
     */
    unfollowFromList: function(msg){
        var userLink = document.querySelector('div>div[role=dialog]>div:nth-child(2)>div>div:nth-child(2)>ul>li a[title="'+msg.username+'"]');
        if(userLink!=null){
            var button = userLink.parentElement.parentElement.parentElement.parentElement.querySelector('button');
            if(button!=null){
                Execute(function (id,args) {
                    window.registerRequest(id, '/web/friendships/'+args.userId+'/unfollow/');
                }, function (result) {
                    //امکان وجود خطا
                    clog('unfollow from list completed:',result);
                    query = JSON.parse(result);
                    postCallback(msg.callbackId,{result:true, user:{ userId:msg.userId,username:msg.username}, response:query});
                },{userId:msg.userId});
                button.click();
            }else{
                clog('unfollow from list:button not found');
                postCallback(msg.callbackId,{result:false});
            }
        }else{
            clog('unfollow from list:user not found');
            postCallback(msg.callbackId,{result:false});
        }
    },

    getProfileInfo: function(msg){
        clog('get profile:', msg)
        Execute(function (id) {
            window.getProfile(id);
        }, function (result) {
            //امکان وجود خطا
            user = JSON.parse(result);
            clog('profile:',user);
            if(user==null){
                postCallback(msg.callbackId,{result:false});
            }else{
                postCallback(msg.callbackId,{result:true,user:user});
            }
        });
    },
    unfollowFromPage: function(msg){
        var button = document.querySelector('span>section>main>article>header>div:nth-child(2)>div>span>span:nth-child(1)>button');
        if(button!=null){
             Execute(function (id,args) {
                window.registerRequest(id, '/web/friendships/'+args.userId+'/unfollow/');
                }, function (result) {
                    //امکان وجود خطا
                    clog('unfollow from page completed:',result);
                    query = JSON.parse(result);
                    postCallback(msg.callbackId,{result:true, user:{ userId:msg.userId,username:msg.username}, response:query});
                },{userId:msg.userId});
                button.click();
        }else{
            clog('unfollow button not found');
            postCallback(msg.callbackId,{result:false});
        }
    }
};

/**
 * جلوگیری از لود شدن تصاویر
 */
/** */
var skipImages = true;
observeDOM( document ,function(args){ 
    if(skipImages){
        for(var i in args){
            args[i].addedNodes.forEach(function(value){
                if(isFunction(value.querySelectorAll)){
                    value.querySelectorAll('img').forEach(function(img){
                        img.removeAttribute('src');
                    });
                }
            });
        }
    }
});

/*
document.querySelectorAll('script').forEach(function(node){
    var src= node.getAttribute('src');
    if(node.innerText.indexOf('connect.facebook.net')!=-1 ||(src!=null&&src.indexOf('facebook.net')!=-1) ){
        node.remove();
    }
});
*/
