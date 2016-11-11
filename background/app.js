/// <reference path="dexie.min.js" />

var tabs = {},
    ports = {},
    popupPort,
    callbacks = {},
    followStatus = {
        none: 0,
        following: 1,
        requested: 2,
        block: 3,
        rejected: 4,
        unfollowed: 5
    };

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
    if (userId == undefined) {
        return null;
    }
    var db = new Dexie('user_' + userId);
    db.version(1).stores({
        tasks: 'id,state,status',
        followHistories: 'id,username,status,datetime'
    });

    /**
    * نسخه دو تغییر وضعیت از رشته به عدد برای بالا بردن سرعت
    */
    db.version(2).upgrade(function (trans) {
        trans.followHistories.toCollection().modify(function (followHistory) {
            switch (followHistory.status) {
                case 'following':
                    followHistory.status = followStatus.following;
                    break;
                case 'requested':
                    followHistory.status = followStatus.requested;
                    break;
                case 'block':
                    followHistory.status = followStatus.block;
                    break;
                case 'rejected':
                    followHistory.status = followStatus.rejected;
                    break;
                case 'unfollowed':
                    followHistory.status = followStatus.unfollowed;
                    break;
                default:
                    clog(followHistory.status);
            }
            
        });
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
        db.close();
        clog('has follow history get:', item);
        if (item == undefined) {
            fn(false);
        } else {
            fn(true);
        }
    }).catch(function (err) {
        db.close();
        clog('has follow history db error:' + err);
    });
}


/**
 * بروز رسانی وضعیت فالو کاربر
 */
function updateFollowHistory(tabId, history) {
    if (tabs[tabId] !== undefined) {
        var viewer = tabs[tabId].getViewer();
        if (viewer != null) {
            clog('history:', history);
            var db = getDb(viewer.id);
            db.followHistories.get(history.id, function (item) {
                clog('item:', item);
                if (item == undefined) {
                    // در صورت وارد نشده بودن زمان آن را برابرحال قرار می دهیم
                    if (history.datetime == undefined) {
                        history.datetime = new Date().getTime();
                    }
                    db.followHistories.add(history).then(function () {
                        db.close();
                        clog('history inserted');
                    }).catch(function (err) {
                        db.close();
                        clog('update follow history: db error: add: ' + err);
                    });
                } else {
                    // در صورت تغییر وضعیت زمان هم تغییر می کند
                    history.datetime = new Date().getTime();
                    //if (item.status != history.status) {
                        
                    //} else {
                    //    if (item.datetime == undefined) {
                    //        history.datetime = new Date().getTime();
                    //    } else {
                    //        history.datetime = item.datetime;
                    //    }
                    //}

                    db.followHistories.put(history).then(function () {
                        db.close();
                        clog('history updated!');
                    }).catch(function (err) {
                        db.close();
                        clog('update follow history: db error: put: ' + err);
                    });
                }
            }).catch(function (err) {
                db.close();
                clog('update follow history: db error: get: ' + err);
            });
        } else {
            clog('viewer does not exists');
        }
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

function inArray(item, arr) {
    return arr.indexOf(item);
}

function bind(fn, context) {
    return fn.bind(context);
};

function exportDatabase(db) {
    return db.transaction('r', db.tables, function() {
        // Map to transaction-bound table instances because instances in db.tables are not bound
        // to current transaction by default (may change in future versions of Dexie)
        var tables = db.tables.map(function (t) {
            return Dexie.currentTransaction.tables[t.name];
        });
        // Prepare a result: An array of {tableName: "name", contents: [objects...]}
        var result = { version: db.verno, tables: [] };
        // Recursively export each table:
        return exportNextTable ();

        function exportNextTable () {
            var table = tables.shift();
            return table.toArray().then(function(a) {
                result.tables.push({
                    tableName: table.name,
                    contents: a
                });
                return tables.length > 0 ?
                    exportNextTable() :
                    result;
            });
        }
    });
};


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
