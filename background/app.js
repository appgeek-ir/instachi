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
                        db.followHistories.add(history).then(function () {
                            clog('history inserted');
                        }).catch(function (err) {
                            clog('update follow history: db error: ' + err);
                        });
                    } else {
                        if (item.datetime == undefined) {
                            history.datetime = new Date().toISOString();
                        } else {
                            history.datetime = item.datetime;
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
        .reverse()
        .limit(10)
        .sortBy('datetime', function (items) {
            for(var i in items){
                var item = items[i];
                $histories.append('<tr><td>'+item.id+'</td><td>'+item.username+'</td><td>'+ item.datetime +'</td><td>'+ item.status +'</td></tr>');
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
            $a.on('click', function (e) {
                e.preventDefault();
                var $this = $(this)
                showFollowHistories($this.data('id').split('_')[1]);
            }).data('id',names[i]);
            $a.appendTo($li);
            $li.appendTo($ul);
        }
    });
});
