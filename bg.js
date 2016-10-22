var tabs = {},
    ports = {},
    popupPort,
    callbacks = {};

// بررسی تابع بودن شی
function isFunction(obj) {
    return !!(obj && obj.constructor && obj.call && obj.apply);
};

function clog() {
    for (var i in arguments) {
        console.log(arguments[i]);
    }
}

//تولید شناسه یکتا
function idGenerator() {
    var S4 = function () {
        return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
    };
    return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
}


function updateTask(id, obj) {
    chrome.storage.local.get('tasks', function (items) {
        var tasks = {};
        if (items.tasks !== undefined) {
            tasks = items.tasks;
        }
        tasks[id] = obj;
        chrome.storage.local.set({
            'tasks': tasks
        }, function () {

        });
    });
}

// ارسال پیام به پورت مشخص
function postMessage(port, args, fn) {
    if (fn !== undefined && isFunction(fn)) {
        var id = idGenerator();
        callbacks[id] = fn;
        args.callbackId = id;
    }
    port.postMessage(args);
}
//فراخوانی تابع بازگشت
function invokeCallback(id, msg) {
    if (callbacks[id] !== undefined) {
        callbacks[id](msg);
        delete callbacks[id];
    }
}

/**
 * گرفتن اتصال دیتابیس جدید
 * userId: برای استفاده همزمان برای چندین حساب کاربری
 */
function getDb(userId) {
    var db = new Dexie('user_' + userId);
    db.version(1).stores({
        tasks: 'id,state,status',
        followHistories: 'id,username,status,datetime'
    });
    db.open().catch(function (e) {
        clog('db.open error:' + e);
    });
    return db;
}

/**
 * بروز رسانی و یا آپدیت وضعیت وظیفه
 */
function persistTask(tabId, task) {
    if (tabId == undefined) {
        var db = getDb('all');
        db.tasks.put(task).catch(function (err) {
            clog('persist task: db error ', err);
        });
    } else if (tabs[tabId] !== undefined) {
        clog('persist task:', task);
        tabs[tabId].postMessage({
            action: 'getCurrentUser'
        }, function (msg) {
            clog('persist task: get current user response ', msg);
            if (msg.result) {
                var db = getDb(msg.user.id);
                db.tasks.put(task).catch(function (err) {
                    clog('persist task: db error ', err);
                });
            } else {
                // خطا
            }
        });
    } else {
        clog('persist task: tab not found');
    }
}

/**
 * بررسی وجود کاربر در تاریخچه
 */
function hasFollowHistory(tabUserId, userId, fn) {
    var db = getDb(tabUserId);
    db.followHistories.get(userId, function (item) {
        clog('has follow history get:', item);
        if (item == undefined) {
            fn(false);
        } else {
            fn(true);
        }
    }).catch(function (err) {
        clog('has follow history db error:' + err);
    });
}


/**
 * بروز رسانی وضعیت فالو کاربر
 */
function updateFollowHistory(tabId, history) {
    if (tabs[tabId] !== undefined) {
        tabs[tabId].postMessage({
            action: 'getCurrentUser'
        }, function (msg) {
            clog('update follow history: ', msg);
            if (msg.result) {
                var db = getDb(msg.user.id);
                clog('history:', history);
                db.followHistories.get(history.id, function (item) {
                    clog('item:', item);
                    if (item == undefined) {
                        // در صورت وارد نشده بودن زمان آن را برابرحال قرار می دهیم
                        if(history.datetime==undefined){
                            history.datetime = new Date().getTime();
                        }
                        db.followHistories.add(history).then(function () {
                            clog('history inserted');
                        }).catch(function (err) {
                            clog('update follow history: db error: ' + err);
                        });
                    } else {
                        // در صورت تغییر وضعیت زمان هم تغییر می کند
                        if(item.status!=history.status){
                            history.datetime = new Date().getTime();
                        }else{
                            if (item.datetime == undefined) {
                                history.datetime = new Date().getTime();
                            } else {
                                history.datetime = item.datetime;
                            }
                        }

                        db.followHistories.put(history).then(function () {
                            clog('history updated!');
                        }).catch(function (err) {
                            clog('update follow history: db error: ' + err);
                        });
                    }
                });
            } else {
                // خطا
            }
        });
    } else {
        clog('update follow history: tab not found');
    }
}

function waitUntil(testFn, callback) {

    if (testFn()) {
        callback();
    } else {
        setTimeout(function () {
            waitUntil(testFn, callback);
        }, 100);
    }
};

function any(arr, testFn) {
    for (var i in arr) {
        if (testFn(arr[i])) {
            return true;
        }
    }
    return false;
}

function all(arr, testFn) {
    for (var i in arr) {
        if (!testFn(arr[i])) {
            return false;
        }
    }
    return true;
}


// گوش دادن به درخواست اتصال
chrome.runtime.onConnect.addListener(function (port) {
    if (port.name == "popup") {
        clog('popup messaging request:', port);
        popupPort = port;
        port.onMessage.addListener(function (msg) {
            popupCtrl[msg.action].apply(popupCtrl, [port, msg]);
        });
    } else {
        if (tabs[port.sender.tab.id] == undefined) {
            clog('new tab messaging request:', port);
            tabs[port.sender.tab.id] = new tab(port.sender.tab.id, port);
        } else {
            clog('existing tab messaging request:', port.sender.tab);
            tabs[port.sender.tab.id].setPort(port);
        }
    }
});

function showFollowHistories(userId) {
    var db = getDb(userId);
    var $histories = $('#histories>tbody');
    $histories.children('*').remove();
    db.followHistories
        .orderBy('datetime')
        //.and(x => $.inArray(x.status,['following','requested'])!=-1)
        //.reverse()
        .limit(10)
        .toArray(function (items) {
            for(var i in items){
                var item = items[i];
                $histories.append('<tr><td>'+item.id+'</td><td>'+item.username+'</td><td>'+ new Date(item.datetime).toISOString() +'</td><td>'+ item.status +'</td></tr>');
            }
        });
}

function update(userId){

    var db = getDb(userId);
    db.followHistories
      .toArray(function (histories) {
        var count= histories.length;

        for(var i in histories){
            clog(count--);
            var history = histories[i];
            var datetime = Date.parse(history.datetime);
            if(!isNaN(datetime)){
                history.datetime = datetime;
                db.followHistories.put(history).then(function () {
                                clog('history updated!');
                            }).catch(function (err) {
                                clog('update follow history: db error: ' + err);
                            });
            }
        }
    });

}

Zepto(function () {
    $('body').append('<div id="container"><div><ul id="dbs"></ul></div><div><table id="histories"><thead></thead><tbody></tbody></table></div></div>');

    var $container = $('#container');

    Dexie.getDatabaseNames(function callback(names) {
        var $ul = $('#dbs');
        for (var i in names) {
            var $li = $('<li></li>');
            var $a = $('<a href="#">' + names[i] + '</a>');
            var $upd = $('<a href="#"> update </a>');
            $upd.on('click',function(e){
                e.preventDefault();
                var $this = $(this)
                update($this.data('id').split('_')[1]);
            }).data('id',names[i]);

            $a.on('click', function (e) {
                e.preventDefault();
                var $this = $(this)
                showFollowHistories($this.data('id').split('_')[1]);
            }).data('id',names[i]);
            $a.appendTo($li);
            $upd.appendTo($li);
            $li.appendTo($ul);
        }
    });
});

/**
 * سازنده وظیفه فالو
 */
var followTask = function (args) {
    this.id = idGenerator();
    this.state = args;
    this.status = 'Stop';
    if (this.state.currentStep == undefined) {
        this.state.users = new Array();
        this.state.profileViewsCount = 0;
        this.state.followsCount = 0;
        this.state.requestsCount = 0;
        this.state.progress = 0;
        if (this.state.pattern == 'posts') {
            this.state.currentStep = 'fetchFollowersFromPosts';
        } else if (this.state.pattern == 'followers') {
            this.state.currentStep = 'fetchFollowersFromList';
        } else if (this.state.pattern == 'hashtag') {
            this.state.currentStep = 'fetchFollowersFromHashtag';
        } else {
            // الگوی اشتباه
        }
    }
}

/**
 * ذخیره سازی اطلاعات وظیفه
 */
followTask.prototype.persist = function (status) {
    persistTask(undefined, {
        id: this.id,
        status: status,
        state: this.state
    });
};

/**
 * شروع وظیفه
 */
followTask.prototype.start = function (tab) {
    this.tab = tab;
    this.tabId = tab.id;
    this.port = tab.port;
    if (this.status != 'Start') {
        this.status = 'Start';
        clog('start task', this);
        this[this.state.currentStep]();
    } else {
        clog('task is already started: ', this);
    }
};

/**
 * استخراج کاربران از پست های صفحه
 */
followTask.prototype.fetchFollowersFromPosts = function () {
    clog('start fetching from posts');
    this.tab.onConnect($.proxy(function (port) {
        clog('connect after going to profile');
        this.state.profileViewsCount++;
        this.tab.removeOnConnect();
        this.pipeline = this.tab.createPipeline($.proxy(function () {
            this.followFromFetchedUsers();
        }, this));
        this.pipeline.register('getPosts', {}, $.proxy(this.getPostsCycle, this));
        this.pipeline.start();
    }, this));
    clog('goto profile: ' + this.state.username);
    this.tab.postMessage({
        action: 'gotoProfile',
        username: this.state.username
    });
};

/**
 * دریافت پست های صفحه
 */
followTask.prototype.getPostsCycle = function (pipeline, msg) {
    clog('get posts', msg);
    if (msg.result) {
        var media;
        if (msg.response !== undefined) {
            if (msg.response.status == 200) {
                media = msg.response.data.media;
            } else {
                //خطایی ممکن است رخ بدهد
                // مثلن نتوانیم به اینستاگرام وصل شویم
                // باید بریم بالا و دوباره بریم پایین
            }
        } else {
            media = msg.media;
        }

        // اضافه کردن مرحله باز کردن پست به پایپ لاین
        for (var i in media.nodes) {
            var item = media.nodes[i];
            if (item.comments.count > 0 || item.likes.count > 0) {
                pipeline.register('openPost', {
                    code: item.code
                }, $.proxy(this.openPostResponse, this));
            }
        }

        // بررسی رفتن به صفحه بعدی
        if (media.page_info.has_next_page) {
            pipeline.register('loadMorePosts', {}, $.proxy(this.getPostsCycle, this));
        }
        pipeline.next();
    } else {
        // کاربر وجود ندارد یا خطای دریافت داشتیم
        clog('can not get posts');
        pipeline.next();
    }
}

/**
 * باز کردن پست
 */
followTask.prototype.openPostResponse = function (pipeline, msg) {
    clog('get post reponse', msg);
    if (msg.result) {
        if (msg.response.status == 200) {
            var media = msg.response.data.media,
                addFlag = 0;
            clog('find user in likes');
            //دریافت اطلاعت لایک ها
            media.likes.nodes.forEach($.proxy(function (item) {
                if (this.state.users.length >= this.state.count) {
                    clog('fetched count is reached');
                    return;
                }
                if (all(this.state.users, function (user) {
                        return user.id != item.user.id
                    })) {
                    addFlag++;
                    clog('check user follow history', item.user);
                    hasFollowHistory(this.tab.getViewer().id, item.user.id, $.proxy(function (exists) {
                        addFlag--;
                        if (!exists) {
                            clog('add user to list:', item.user);
                            this.state.users.push(item.user);
                            this.state.progress = this.state.users.length/this.state.count*100;
                        }
                    }, this));
                }
            }, this));

            // صبر بابت پایان گرفتن عملیات دیتابیس
            waitUntil(function () {
                return addFlag == 0;
            }, $.proxy(function () {
                //دریافت اطلاعات کامنت ها
                clog('find user in comments');
                media.comments.nodes.forEach($.proxy(function (item) {
                    if (this.state.users.length >= this.state.count) {
                        clog('fetched count is reached');
                        return;
                    }
                    if (all(this.state.users, function (user) {
                            return user.id != item.user.id
                        })) {
                        addFlag++;
                        clog('check user follow history', item.user);
                        hasFollowHistory(this.tab.userId, item.user.id, $.proxy(function (exists) {
                            addFlag--;
                            if (!exists) {
                                clog('add user to list:', item.user);
                                this.state.users.push(item.user);
                                this.state.progress = this.state.users.length/this.state.count*100;
                            }
                        }, this));
                    }
                }, this));

                // صبر بابت پایان گرفتن عملیات دیتابیس
                waitUntil(function () {
                    return addFlag == 0;
                }, $.proxy(function () {
                    clog('check for next step');
                    if (this.state.users.length < this.state.count) {
                        // بررسی وجود کامنت بیشتر
                        if (media.comments.page_info.has_previous_page) {
                            pipeline.registerAfter('loadMoreComments', {}, $.proxy(this.loadMoreCommentsResponse, this));
                        }
                        pipeline.next();
                    } else {
                        //پایان استخراج کاربران
                        pipeline.end();
                    }
                }, this));
            }, this));

        } else {
            clog('network or server error!');
            pipeline.next();
        }
    } else {
        clog('can not open post');
        pipeline.next();
    }
};

/**
 * لود کامنت های بیشتر
 */
followTask.prototype.loadMoreCommentsResponse = function (pipeline, msg) {
    clog('more comments response:', msg);
    if (msg.result) {
        if (msg.response.status == 200) {
            if (msg.response.data.status == 'ok') {
                clog('find user in comments');
                var addFlag = 0;
                var media = msg.response.data;
                media.comments.nodes.forEach($.proxy(function (item) {
                    if (this.state.users.length >= this.state.count) {
                        return;
                    }
                    if (all(this.state.users, function (user) {
                            return user.id != item.user.id
                        })) {
                        addFlag++;
                        hasFollowHistory(this.tab.userId, item.user.id, $.proxy(function (exists) {
                            addFlag--;
                            if (!exists) {
                                clog('add user to list:', item.user);
                                this.state.users.push(item.user);
                                this.state.progress = this.state.users.length/this.state.count*100;
                            }
                        }, this));
                    }
                }, this));
                // صبر بابت پایان گرفتن عملیات دیتابیس
                waitUntil(function () {
                    return addFlag == 0;
                }, $.proxy(function () {
                    clog('check for next step');
                    if (this.state.users.length < this.state.count) {
                        // بررسی وجود کامنت بیشتر
                        if (media.comments.page_info.has_previous_page) {
                            pipeline.registerAfter('loadMoreComments', {}, $.proxy(this.loadMoreCommentsResponse, this));
                        }
                        pipeline.next();
                    } else {
                        // پایان استخراج کاربران
                        pipeline.end();
                    }
                }, this));

            } else {
                //خطای پاسخ
                pipeline.next();
            }
        } else {
            //خطای سرور
            pipeline.next();
        }
    } else {
        // خطای لود
        pipeline.next();
    }
}

/**
 * فالو کردن کاربران از طریق لیست استخراج شده ها
 */
followTask.prototype.followFromFetchedUsers = function () {
    this.state.progress = 0;
    clog('starte follow from fetched users');
    this.pipeline = this.tab.createPipeline($.proxy(function () {
        this.completed(this);
    }, this));

    for (var i in this.state.users) {
        var user = this.state.users[i];
        this.pipeline.register($.proxy(function () {
                this.state.currentUser = user;
                this.tab.onConnect($.proxy(function () {
                    clog('connect after going to profile');
                    this.state.profileViewsCount++;
                    this.tab.removeOnConnect();
                    this.pipeline.port = this.tab.port;
                    this.pipeline.next();
                }, this));
                this.pipeline.next();
            }, this))
            .register('gotoProfile', {
                username: user.username
            })
            .register('getProfileInfo', {}, $.proxy(this.getProfileInfoResponse, this))
            .register('followFromPage', {
                username: user.username,
                userId: user.id
            }, $.proxy(this.followFromProfileResponse,this));

    }
    this.pipeline.start();
};

/**
 * هندل کردن پاسخ دریافت اطلاعات پروفایل
 */
followTask.prototype.getProfileInfoResponse = function (pipeline, msg) {
    this.state.progress = pipeline.index/pipeline.steps.length *100;
    clog('get profile info reponse', msg);
    if (msg.result) {
        if (!(msg.user.followed_by_viewer || msg.user.requested_by_viewer)) {
            // بررسی تاریخچه فالو
            pipeline.next();
        } else {

            clog('followed: skip from follow');
            var status = msg.user.followed_by_viewer ? 'following' : 'requested';
            // پرش از فالو
            // قبلن بررسی کردیم که کاربر درون لیست نباشد
            // پس کاربر نیست و باید این را ذخیره کنیم
            updateFollowHistory(this.tabId, {
                id: msg.user.id,
                username: msg.user.username,
                status: status
            });
            pipeline.next(2);
        }
    } else {
        clog('can not access: skip from follow');
        // کاربر وجود نداشت
        updateFollowHistory(this.tabId, {
            id: this.state.currentUser.id,
            username: this.state.currentUser.username,
            status: 'block'
        });
        pipeline.next(2);
    }
};

/**
 * پاسخ فالو از پروفایل
 */
followTask.prototype.followFromProfileResponse = function (pipeline, msg) {
    clog('follow response :', msg);
    if (msg.result) {
        if (msg.response.status == 200) {
            if (msg.response.data.status == 'ok') {
                if(msg.response.data.result=='following'){
                    this.state.followsCount++;
                }else{
                    this.state.requestsCount++;
                }
                var currentUser = pipeline.getCurrentStep().args;
                updateFollowHistory(this.tabId, {
                    id: currentUser.userId,
                    username: currentUser.username,
                    status: msg.response.data.result,
                    datetime: new Date().getTime()
                });
                pipeline.next(1, 1);
            } else {
                clog('follow failed!: server error', this.state.currentUser);
            }
        } else {
            var rnd = Math.floor(Math.random() * 6) + 5;
            clog('block or network error, retry ' + rnd + 'min again', this.state);
            var waitUntil = new Date();
            waitUntil.setSeconds(waitUntil.getSeconds()+ rnd * 60);
            this.state.waitUntil = waitUntil;
            setTimeout($.proxy(this.endWaiting,this),rnd * 60 * 1000);
            //بلاک شدن یا عدم اتصال به اینترنت و ..
            pipeline.previous(3, rnd * 60);
        }
    } else {
        //خطا
        clog('follow failed!', this.state.currentUser);
        pipeline.next();
        return;
    }
}

/**
* پایان دادن به صبر
*/
followTask.prototype.endWaiting = function(){
    this.state.waitUntil = undefined;
}

//.........................

/**
 * فاو کاربران بدون بررسی حالت فالو
 */
followTask.prototype.followFollowersWithoutCheck = function () {
    clog('follow followers without check');
    this.tab.onConnect($.proxy(function () {
        clog('connect after going to profile');
        this.tab.removeOnConnect();
        this.pipeline = this.tab.createPipeline($.proxy(function () {
            this.completed(this);
        }, this));
        this.state.currentPage = 1;
        this.pipeline.register('openFollowers', {}, $.proxy(this.followFollowersCycle, this))
            .start();
    }, this));
    this.tab.postMessage({
        action: 'gotoProfile',
        username: this.state.username
    });
};

/**
 * چرخه فالو کاربران
 */
followTask.prototype.followFollowersCycle = function (pipeline, msg) {
    clog('get users info:', msg);
    clog('page:' + this.state.currentPage);
    if (msg.result) {
        if (msg.response.status == 200) {
            var data = msg.response.data;
            if (data.status == 'ok') {
                for (var i in data.followed_by.nodes) {
                    var node = data.followed_by.nodes[i];
                    if (!node.requested_by_viewer && !node.followed_by_viewer && (!this.state.checkFollowHistory || !hasFollowHistory(node.id))) {
                        clog('add user to follow pipeline:', node);
                        pipeline.register('followFromList', {
                            userId: node.id,
                            username: node.username
                        }, $.proxy(this.followRequested, this));
                    } else {
                        clog('user already follow / follow requested / followed more than once:', node);
                    }
                }
                if (data.followed_by.page_info.has_next_page) {
                    this.state.currentPage++;
                    pipeline.register('loadMoreFollowers', {}, $.proxy(this.followFollowersCycle, this));
                    clog('more records are comming!');
                } else {
                    clog('no more record available!');
                }
                pipeline.next();
            } else {
                clog('get users failed: server error!');
            }
        } else {
            // خطای دریافت
            clog('get users faild: network error!');
        }

    } else {
        //خطا
        clog('get users failed!');
    }
};

/**
 * بررسی درخواست دنبال کردن کاربر
 * msg
 *  result: boolean
 *  request:
 *    status: status code
 *    data: server response
 */
followTask.prototype.followRequested = function (pipeline, msg) {
    clog('follow response :', msg);
    if (msg.result) {
        if (msg.response.status == 200) {
            if (msg.response.data.status == 'ok') {
                this.state.count--;
                var currentUser = pipeline.getCurrentStep().args;
                updateFollowHistory(this.tabId, {
                    id: currentUser.userId,
                    username: currentUser.username,
                    status: msg.response.data.result,
                    datetime: new Date().getTime()
                });

                if (this.state.count < 1) {
                    clog('pipeline completed', this.state);
                    this.persist('completed');
                    pipeline.completed(this);
                    return;
                } else {
                    this.persist();
                    pipeline.next();
                    return;
                }
            } else {
                clog('follow failed!: server error', this.state.currentUser);
            }
        } else {
            clog('follow failed!: network error', this.state.currentUser);
        }
    } else {
        //خطا
        clog('follow failed!', this.state.currentUser);
        pipeline.next();
        return;
    }
};

/**
* دریافت وضعیت وظیفه
*/
followTask.prototype.getStatus = function(){
    var currentStep;
    switch(this.state.currentStep){
        case 'fetchFollowersFromPosts':
            currentStep = 'استخراج کاربران از پست ها';
            break;
        case 'fetchFollowersFromList':
            currentStep = 'استخراج کاربران از لیست فالورها';
            break;
        case 'fetchFollowersFromHashtag':
            currentStep = 'استخراج کاربران از پست های هشتگ';
            break;
        case 'followFromFetchedUsers':
            currentStep = 'فالوکردن کاربران';
            break;
    }

    return {
        type: 'فالو',
        progress : this.state.progress>100?100:Math.floor(this.state.progress),
        step  : currentStep,
        waitUntil:this.state.waitUntil!=undefined?this.state.waitUntil.toISOString():undefined,
        states:[
            {name:'کاربران استخراج شده',value:this.state.users.length},
            {name:'صفحات باز شده',value:this.state.profileViewsCount},
            {name:'کاربران فالو شده',value:this.state.followsCount},
            {name:'درخواست های فالو',value:this.state.requestsCount}
        ]
    };
};

/**
 * اتمام وظیفه فالو
 */
followTask.prototype.completed = function () { /* nothing */ };

// خط لوله اجرای دستور
var pipeline = function (port, onCompleted) {
    this.steps = new Array();
    this.index = 0;
    this.port = port;
    this.onCompleted = onCompleted;
}

pipeline.prototype.register = function (action, args, fn) {
    if (isFunction(action)) {
        this.steps.push({
            callback: action,
            args: args,
            type: 'fn'
        });
    } else {
        args = args || {};
        args.action = action;
        this.steps.push({
            args: args,
            callback: fn,
            type: 'page'
        });
    }

    return this;
};

/**
 * رجیستر کردن عملیات بعد از مرحله در حال اجرا
 */
pipeline.prototype.registerAfter = function (action, args, fn) {
    if (isFunction(action)) {
        this.steps.splice(this.index + 1, 0, {
            callback: action,
            args: args,
            type: 'fn'
        });
    } else {
        args = args || {};
        args.action = action;
        this.steps.splice(this.index + 1, 0, {
            args: args,
            callback: fn,
            type: 'page'
        });
    }

    return this;
}

pipeline.prototype.start = function () {
    this.index = -1;
    this.startTime = new Date();
    this.status = 'Started';
    return this.next();
}

pipeline.prototype.next = function (steps, seconds) {
    if (seconds == undefined) {
        if (this.status != 'Started') {
            clog('pipeline is not started');
            return;
        }
        steps = steps || 1;
        this.index += steps;
        if (this.index < this.steps.length) {
            var step = this.steps[this.index];
            if (step.type == 'page') {
                clog('pipeling page call:', step);
                postMessage(this.port, step.args, $.proxy(function (msg) {
                    step.callback(this, msg);
                }, this));
            } else {
                clog('pipeling fn call:', step);
                step.callback(step.args);
            }
        } else {
            clog('pipeline completed');
            this.completed('Completed');
        }
    } else {
        setTimeout($.proxy(function () {
            this.next(steps);
        }, this), seconds * 1000);
    }
}

pipeline.prototype.previous = function (steps, seconds) {
    if (seconds == undefined) {
        if (this.status != 'Started') {
            clog('pipeline is not started');
            return;
        }
        steps = steps || 1;
        this.index -= steps;
        if (this.index > -1) {
            var step = this.steps[this.index];
            if (step.type == 'page') {
                clog('pipeling page call:', step);
                postMessage(this.port, step.args, $.proxy(function (msg) {
                    step.callback(this, msg);
                }, this));
            } else {
                clog('pipeling fn call:', step);
                step.callback(step.args);
            }
        } else {
            clog('pipeline completed');
            this.completed('Completed');
        }
    } else {
        setTimeout($.proxy(function () {
            this.previous(steps);
        }, this), seconds * 1000);
    }
}

pipeline.prototype.end = function () {
    clog('pipeline end');
    this.completed('Stoped');
};

pipeline.prototype.completed = function (status) {
    this.status = status;
    clog('steps:', this.steps.length);
    clog('complete time:', (new Date() - this.startTime) / 1000);
    if (this.onCompleted !== undefined) {
        this.onCompleted();
    }
}

pipeline.prototype.getCurrentStep = function () {
    return this.steps[this.index];
}

pipeline.prototype.retry = function (seconds) {
    seconds = seconds || 0.1;
    setTimeout($.proxy(function () {
        if (this.status != 'Started') {
            clog('retry failed: pipeline is not started');
            return;
        }
        var step = this.steps[this.index];
        clog('pipeling next step:', step);
        postMessage(this.port, step.args, $.proxy(function (msg) {
            step.callback(this, msg);
        }, this));
    }, this), seconds * 1000);
}

/**
 * کنترلر پپ آپ
 */
var popupCtrl = {
    activationStatus: function (port, msg) {
        clog('activation status: ', msg);
        port.postMessage({
            action: 'callback.activationStatus',
            result: true
        });
    },
    loginStatus: function (port, msg) {
        clog('login status: ', msg);
        port.postMessage({
            action: 'callback.loginStatus',
            result: true
        });
    },
    /**
     * ایجاد وظیفه
     */
    createTask: function (port, msg) {
        clog('create task request:', msg);
        //تولید وظیفه
        var result = taskService.create(msg);
        //بازگردانی نتیجه
        port.postMessage({
            action: 'callback.createTask',
            result: result
        });
    },
    getCurrentPage: function (port, msg) {
        clog('get current page request:', msg);
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, function (items) {
            if (items.length > 0) {
                tabs[items[0].id].postMessage({
                    action: 'getCurrentPage'
                }, function (msg) {
                    clog('get current page response :', msg);
                    port.postMessage({
                        action: 'callback.getCurrentPage',
                        result: msg.result,
                        username: msg.username
                    });
                });
            } else {
                port.postMessage({
                    action: 'callback.getCurrentPage',
                    result: false
                });
            }
        });
    },
    getCurrentTask: function (port, msg) {
        clog('get current task',msg );
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, function (items) {
            if (items.length > 0) {
                if (tabs[items[0].id].task != undefined) {
                    clog('task found');
                    port.postMessage({
                        action: 'callback.getCurrentTask',
                        result: true,
                        task: tabs[items[0].id].task.getStatus()
                    });
                } else {
                    clog('task not found');
                    port.postMessage({
                        action: 'callback.getCurrentTask',
                        result: false
                    });
                }
            } else {
                clog('tab not found');
                port.postMessage({
                    action: 'callback.getCurrentTask',
                    result: false
                });
            }
        });

    }
};

/**
 * کلاس تب
 */
var tab = function (id, port) {
    this.id = id;
    this.setPort(port);
};

/**
 * رویداد زمان اتصال به تب
 */
tab.prototype.onConnect = function (fn) {
    if (fn !== undefined && isFunction(fn)) {
        this.onConnectCallback = fn
    } else {
        if (this.onConnectCallback !== undefined) {
            this.onConnectCallback();
        }
    }
};

/**
 * حذف اتصال به تب
 */
tab.prototype.removeOnConnect = function () {
    if (this.onConnectCallback !== undefined) {
        delete this.onConnectCallback;
    }
};

/**
 * اتصال پورت به تب
 */
tab.prototype.setPort = function (port) {
    this.port = port;

    //اضافه کردن لیستنر
    chrome.pageAction.show(this.id);
    port.onMessage.addListener(function (msg) {
        if (msg.action != undefined && msg.action != null) {
            if (msg.action.indexOf("callback.") == 0) {
                var id = msg.action.split('.')[1];
                invokeCallback(id, msg);
            } else {

            }
        }
    });
    port.onDisconnect.addListener(function (msg) {

    });
    this.onConnect();

    //دریافت اطلاعات صفحه
    this.postMessage({ action:'getSharedData' },$.proxy(function(msg){
        if(msg.result){
            this.sharedData = msg.sharedData;
        }else{

        }
    },this));
};

/**
 * ارسال پیام
 */
tab.prototype.postMessage = function (args, fn) {
    postMessage(this.port, args, fn);
};

/**
 * ایجاد پایپ لاین
 */
tab.prototype.createPipeline = function (onCompleted) {
    return new pipeline(this.port, onCompleted);
};

tab.prototype.getViewer = function()
{
    if(this.sharedData!=undefined && this.sharedData.config.viewer != null){
        return this.sharedData.config.viewer;
    }
    return null;
};

// تولید کننده کار
var taskService = {
  waitingList: new Array(),
  create: function (args) {
    var task;
    switch (args.type) {
      case 'Follow':
        task = new followTask(args);
        break;
      case 'Unfollow':
        task = new unfollowTask(args);
        break;
    }
    if (task === undefined) {
      return false;
    }
    task.persist();
    //راه اندازی خودکار
    if (args.startType == 'auto') {
      this.runTask(task);
    }
    return true;
  },
  runTask: function (task) {
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, $.proxy(function (items) {
      //اولویت با تب جاری است
      if (items.length > 0 && tabs[items[0].id].task !== undefined) {
        tabs[items[0].id].task = task;
        task.completed = $.proxy(this.taskCompleted, this);
        task.start(tabs[items[0].id]);
      } else {
        //بررسی سایر تب ها
        var findFlag = false;
        for (var i in tabs) {
          if (tabs[i].task === undefined) {
            tabs[i].task = task;
            findFlag = true;
            task.completed = $.proxy(this.taskCompleted, this);
            task.start(tabs[i]);
          }
        }
        if (!findFlag) {
          this.waitingList.push(task.id);
        }
      }
    }, this));
  },
  taskCompleted: function (task) {
    if (tabs[task.tabId] !== undefined) {
      delete tabs[task.tabId].task;
    }
  }
}


/**
 * وظیفه آنفالو کردن کاربران
 */
var unfollowTask = function (args) {
    this.id = idGenerator();
    this.state = args;
    this.status = 'Stop';
    if (this.state.currentStep == undefined) {
        this.state.users = new Array();
        this.state.unfollowsCount = 0;
        this.state.profileViewsCount = 0;
        this.state.retakeRequestsCount = 0;
        this.state.fetchedUsersCount = 0;
        this.state.progress;
        if (this.state.pattern == 'auto') {
            this.state.currentStep = 'fetchFollowHistories';
        } else {
            this.state.currentStep = 'fetchFromFollowings';
        }
    }
};

unfollowTask.prototype.persist = function (status) {
    persistTask(undefined, {
        id: this.id,
        status: status,
        state: this.state
    });
};

unfollowTask.prototype.start = function (tab) {
    this.tab = tab;
    this.tabId = tab.id;
    this.port = tab.port;
    if (this.status != 'Start') {
        this.status = 'Start';
        clog('start task', this);
        this[this.state.currentStep]();
    } else {
        clog('task is already started: ', this);
    }
};

unfollowTask.prototype.completed = function () { /* nothing */ };

/**
 * استخراج کاربران از لیست
 */
unfollowTask.prototype.fetchFromFollowings = function () {
    clog('fetch from followings list');
    this.tab.onConnect($.proxy(function () {
        clog('connect after going to home');
        this.tab.removeOnConnect();

        // ایجاد پایپ لاین
        this.pipeline = this.tab.createPipeline($.proxy(function () {
            clog('unfollow completed!');
            this.completed(this);
        }, this));

        // باز کردن فالوینگ ها
        this.pipeline.register('openFollowings', {}, $.proxy(this.fetchFollowingsCycle, this))
            .start();

    }, this));

    // ؤفتن به صفحه خانگی
    this.tab.postMessage({
        action: 'gotoHomePage'
    });
};

/**
* چرخه استخراج فالوینگ ها
*/
unfollowTask.prototype.fetchFollowingsCycle = function (pipeline, msg) {
    clog('fetch followings response:', msg);
    if (msg.result) {
        if (msg.response.status == 200) {
            var data = msg.response.data;
            if (data.status == 'ok') {

                // روند پیشرفت
                this.state.fetchedUsersCount += data.follows.nodes.length;
                this.state.progress = this.state.fetchedUsersCount / data.follows.count * 100;

                //استخراج کاربران
                for (var i in data.follows.nodes) {
                    var node = data.follows.nodes[i];
                    updateFollowHistory(this.tabId, {
                        id: node.id,
                        username: node.username,
                        status: 'following'
                    });
                }

                // بررسی صفحه بعدی
                if (data.follows.page_info.has_next_page) {
                    clog('more records are comming!');
                    pipeline.register('loadMoreFollowings', {}, $.proxy(this.fetchFollowingsCycle, this));
                    pipeline.next(1, 1);
                } else {
                    clog('no more records available!');
                    pipeline.end();
                }

            } else {
                clog('response error');
                //خطا و پایان
                pipeline.next();
            }
        } else {
            clog('server error');
            //خطا و پایان
            pipeline.next();
        }
    } else {
        clog('can not fetch followings');
        //خطا و پایان
        pipeline.next();
    }
};

/**
 * استخراج کاربران از تاریخچه
 */
unfollowTask.prototype.fetchFollowHistories = function () {

    // ایجاد پایپ لاین
    this.pipeline = this.tab.createPipeline($.proxy(function () {
        clog('task completed', this.state);
        this.completed(this);
    }, this));

    var createPipeline = $.proxy(function (followHistory) {
        this.pipeline
            .register($.proxy(function () {
                this.state.currentUser = followHistory;
                this.tab.onConnect($.proxy(function () {
                    clog('connect after going to profile');
                    this.state.profileViewsCount++;
                    this.tab.removeOnConnect();
                    this.pipeline.port = this.tab.port;
                    this.pipeline.next();
                }, this));
                this.pipeline.next();
            }, this))
            .register('gotoProfile', {
                username: followHistory.username
            })
            .register('getProfileInfo', {}, $.proxy(this.getProfileInfoResponse, this))
            .register('unfollowFromPage', {
                userId: followHistory.id,
                username: followHistory.username
            }, $.proxy(this.unfollowFromPageResponse, this));
    }, this);

    this.tab.postMessage({
        action: 'getCurrentUser'
    }, $.proxy(function (msg) {
        if (msg.result) {
            var db = getDb(msg.user.id);
            var equals = ['following'];
            if (this.state.checkRequests) {
                equals.push('requested');
            }

            db.followHistories
                .orderBy('datetime')
                .and(x => $.inArray(x.status,equals)!=-1)
                .reverse()
                .limit(this.state.count)
                .toArray($.proxy(function (items) {
                    for (var i in items) {
                        clog('history', items[i]);
                        createPipeline(items[i]);
                    }
                    this.pipeline.start();
                }, this));

        } else {
            //خطا
            this.pipeline.end();
        }
    }, this));
};

/**
 * دریافت اطلاعات پروفایل
 */
unfollowTask.prototype.getProfileInfoResponse = function (pipeline, msg) {
    this.state.progress = pipeline.index/pipeline.steps.length *100;
    clog('get profile info reponse', msg);
    if (msg.result) {
        // بررسی فالو شدن بوسیله ما
        if (msg.user.followed_by_viewer) {
            if (this.state.checkFollowStatus) {
                if (!msg.user.follows_viewer) {
                    clog('daoos found');
                    this.state.currentUser.currentState = 'following';
                    pipeline.next();
                } else {
                    clog('user currently follow me!');
                    if (this.state.currentUser.status == 'requested') {
                        updateFollowHistory(this.tabId, {
                            id: msg.user.id,
                            username: msg.user.username,
                            status: 'following'
                        });
                    }
                    pipeline.next(2);
                }
            } else {
                clog('dont check follow status');
                this.state.currentUser.currentState = 'following';
                pipeline.next();
            }
        } else if (msg.user.requested_by_viewer) {
            if (this.state.checkRequests) {
                // پس گرفتن فالو
                clog('not accepted request');
                this.state.currentUser.currentState = 'requested';
                pipeline.next();
            } else {
                updateFollowHistory(this.tabId, {
                    id: msg.user.id,
                    username: msg.user.username,
                    status: 'requested'
                });
                pipeline.next(2);
            }

        } else {
            clog('not followed: skip from follow');
            //رد شدن از آنفالو
            updateFollowHistory(this.tabId, {
                id: msg.user.id,
                username: msg.user.username,
                status: 'unfollowed'
            });
            pipeline.next(2);
        }
    } else {
        clog('can not access: skip from follow');
        // کاربر وجود نداشت
        updateFollowHistory(this.tabId, {
            id: this.state.currentUser.id,
            username: this.state.currentUser.username,
            status: 'block'
        });
        pipeline.next(2);
    }
};

/**
* آنفالو از صفحه
*/
unfollowTask.prototype.unfollowFromPageResponse = function (pipeline, msg) {
    clog('unfollow response', msg);
    if (msg.result) {
        if (msg.response.status == 200) {
            if(this.state.currentUser.currentState=='following'){
                this.state.unfollowsCount++;
            }else{
                this.state.retakeRequestsCount++;
            }

            updateFollowHistory(this.tabId, {
                id: msg.user.userId,
                username: msg.user.username,
                status: 'unfollowed'
            });
            pipeline.next(1, 1);
        } else {
            var rnd = Math.floor(Math.random() * 6) + 5;
            clog('block or network error, retry ' + rnd + 'min again', this.state);
            //بلاک شدن یا عدم اتصال به اینترنت و ..
             var waitUntil = new Date();
            waitUntil.setSeconds(waitUntil.getSeconds()+ rnd * 60);
            this.state.waitUntil = waitUntil;
            setTimeout($.proxy(this.endWaiting,this),rnd * 60 * 1000);

            pipeline.previous(3, rnd * 60);
        }
    } else {
        clog('follow error : skip');
        // خطا در فالو
        pipeline.next();
    }
}

/**
* پایان دادن به صبر
*/
unfollowTask.prototype.endWaiting = function(){
    this.state.waitUntil = undefined;
}

/**
* دریافت وضعیت وظیفه
*/
unfollowTask.prototype.getStatus = function(){
    var currentStep;
    switch(this.state.currentStep){
        case 'fetchFromFollowings':
            currentStep = 'استخراج فالوینگ ها';
            break;
        case 'fetchFollowHistories':
            currentStep = 'آنفالو کردن کاربران';
            break;
    }

    return {
        type: 'آنفالو',
        progress : this.state.progress>100?100:Math.floor(this.state.progress),
        step  : currentStep,
        waitUntil:this.state.waitUntil!=undefined?this.state.waitUntil.toISOString():undefined,
        states:[
            {name:'تعداد',value:this.state.count},
            {name:'صفحات باز شده',value:this.state.profileViewsCount},
            {name:'کاربران آنفالو شده',value:this.state.unfollowsCount},
            {name:'درخواست های پس گرفته شده',value:this.state.retakeRequestsCount}
        ]
    };
};
