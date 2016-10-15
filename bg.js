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

//بررسی درخواست قبلی داشتن
function hasFollowHistory(id) {
  return false;
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
        db.followHistories.put(history).catch(function (err) {
          clog('update follow history: db error: ', err);
        });
      } else {
        // خطا
      }
    });
  } else {
    clog('update follow history: tab not found');
  }
}


// کلاس تب
var tab = function (id, port) {
  this.id = id;
  this.setPort(port);
};
tab.prototype.onConnect = function (fn) {
  if (fn !== undefined && isFunction(fn)) {
    this.onConnectCallback = fn
  } else {
    if (this.onConnectCallback !== undefined) {
      this.onConnectCallback();
    }
  }
};
tab.prototype.removeOnConnect = function () {
  if (this.onConnectCallback !== undefined) {
    delete this.onConnectCallback;
  }
};
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
};
tab.prototype.postMessage = function (args, fn) {
  postMessage(this.port, args, fn);
};
tab.prototype.createPipeline = function (onCompleted) {
  return new pipeline(this.port, onCompleted);
};

// خط لوله اجرای دستور
var pipeline = function (port, onCompleted) {
  this.steps = new Array();
  this.index = 0;
  this.port = port;
  this.onCompleted = onCompleted;
}

pipeline.prototype.register = function (action, args, fn) {
  args = args || {};
  args.action = action;
  this.steps.push({
    args: args,
    callback: fn
  });
  return this;
};

pipeline.prototype.start = function () {
  this.index = -1;
  return this.next();
}

pipeline.prototype.next = function () {
  this.index++;
  if (this.index < this.steps.length) {
    var step = this.steps[this.index];
    clog('pipeling next step:', step);
    postMessage(this.port, step.args, $.proxy(function (msg) {
      step.callback(this, msg);
    }, this));
  } else {
    clog('pipeline completed');
    this.completed();
  }
  return this;
}

pipeline.prototype.completed = function () {
  if (this.onCompleted !== undefined) {
    this.onCompleted();
  }
}

pipeline.prototype.getCurrentStep = function(){
  return this.steps[this.index];
}


// تولید کننده کار
var taskService = {
  waitingList: new Array(),
  create: function (args) {
    var task;
    switch (args.type) {
      case 'Follow':
        task = new followTask(args);
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
 * سازنده وظیفه فالو
 */
var followTask = function (args) {
  this.id = idGenerator();
  this.state = args;
  this.status = 'Stop';
  if (this.state.currentStep == undefined) {
    if (this.state.patternType == 'auto') {
      this.state.currentStep = 'fetchOnlineFollowers';
    } else if (this.state.pattern == 'posts' || this.state.checkFollowStatus) {
      this.state.currentStep = 'fetchFollowers';
    } else {
      this.state.currentStep = 'followFollowersWithoutCheck';
    }
  }
}
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
  this.pipeline = new pipeline(this.port, $.proxy(this.completed, this));
  if (this.status != 'Start') {
    this.status = 'Start';
    clog('start task', this);
    this[this.state.currentStep]();
  } else {
    clog('task is already started: ', this);
  }
};
//گرفتن فالورها از سایت
followTask.prototype.fetchOnlineFollowers = function () {

};
//استخراج فالورها از صفحه
followTask.prototype.fetchFollowers = function () {

};
/**
 * فاو کاربران بدون بررسی حالت فالو
 */
followTask.prototype.followFollowersWithoutCheck = function () {
  clog('follow followers without check');
  this.tab.onConnect($.proxy(function () {
    clog('connect after going to profile');
    this.tab.removeOnConnect();
    this.pipeline = this.tab.createPipeline($.proxy(function(){
        this.completed(this);
    }, this));
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
  if (msg.result) {
    if (msg.response.status == 200) {
      var data = msg.response.data;
      if (data.status == 'ok') {
        for (var i in data.followed_by.nodes) {
          var node = data.followed_by.nodes[i];
          if (!node.requested_by_viewer && !node.followed_by_viewer && (!this.state.checkFollowHistory || !hasFollowHistory(node.id))) {
            clog('add user to follow pipeline:', node);
            pipeline.register('followFromList', { userId:node.id,username:node.username }, $.proxy(this.followRequested, this));
          }else{
            clog('user already follow / follow requested / followed more than once:',node);
          }
        }
        if (data.followed_by.page_info.has_next_page) {
          pipeline.register('loadMoreFollowers',{}, $.proxy(this.followFollowersCycle, this));
          clog('more records are comming!');
        }else{
          clog('no more record available!');
        }
        pipeline.next();
      } else{
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
          datetime: new Date().toISOString()
        });

        if (this.state.count < 1) {
          clog('pipeline completed',this.state);
          this.persist('completed');
          pipeline.completed(this);
          return;
        } else {
          this.persist();
          pipeline.next();
          return;
        }
      } else {
        clog('follow failed!: server error',this.state.currentUser);
      }
    } else {
      clog('follow failed!: network error',this.state.currentUser);
    }
  } else {
    //خطا
    clog('follow failed!',this.state.currentUser);
    pipeline.next();
    return;
  }
};

/**
 * اتمام وظیفه فالو
 */
followTask.prototype.completed = function () { /* nothing */ };

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
  }
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

/*
var request = indexedDB.open('instaext', 1);
var db;
request.onerror = function (event) {
  alert("Why didn't you allow my web app to use IndexedDB?!");
};
request.onsuccess = function (event) {
  db = event.target.result;
  clog('db succeeded');
};
request.onupgradeneeded = function (event) {
  db = event.target.result;

  // Create an objectStore for this database
  var objectStore = db.createObjectStore("followers", {
    keyPath: "id"
  });
  objectStore.createIndex("username", "username", {
    unique: true
  });

};
*/