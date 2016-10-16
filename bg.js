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
        /*
        db.followHistories.update(history.id, {
          username: history.username,
          status: history.status
        }).then(function (updated) {
          if (updated == 1) {

          } else {
            history.datetime = new Date().toISOString();
            db.followHistories.add(history).catch(function (err) {
              clog('update follow history: db error: ' + err);
            });

          }
        });
        db.followHistories.put(history).catch(function (err) {
          clog('update follow history: db error: ', err);
        });
        */
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
    clog('steps:',this.steps.length);
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
          datetime: new Date().toISOString()
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
 * اتمام وظیفه فالو
 */
followTask.prototype.completed = function () { /* nothing */ };


/**
 * وظیفه آنفالو کردن کاربران
 */
var unfollowTask = function (args) {
  this.id = idGenerator();
  this.state = args;
  this.status = 'Stop';
  this.state.unfollows = 0;
  this.state.profileViews = 0;
  if (this.state.currentStep == undefined) {
    this.state.users = new Array();
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
    this.pipeline = this.tab.createPipeline($.proxy(function () {
      clog('unfollow completed!');
      this.completed(this);
    }, this));
    this.pipeline.register('openFollowings', {}, $.proxy(this.fetchFollowingsCycle, this))
      .start();
  }, this));
  this.tab.postMessage({
    action: 'gotoHomePage'
  });
};

unfollowTask.prototype.fetchFollowingsCycle = function (pipeline, msg) {
  clog('fetch followings response:', msg);
  if (msg.result) {
    if (msg.response.status == 200) {
      var data = msg.response.data;
      if (data.status == 'ok') {
        for (var i in data.follows.nodes) {
          if (this.state.order == 'none' && this.state.users.length >= this.state.count) {
            break;
          }
          var node = data.follows.nodes[i];
          this.state.users.push({
            userId: node.id,
            username: node.username
          });
          updateFollowHistory(this.tabId, {
            id: node.id,
            username: node.username,
            status: 'following'
          });
        }
        var end = false;
        if (this.state.order == 'none' && this.state.users.length >= this.state.count) {
          //end of pipe
          end = true;
          clog('desired count reached', this.state.users);
        } else {
          if (data.follows.page_info.has_next_page) {
            pipeline.register('loadMoreFollowings', {}, $.proxy(this.fetchFollowingsCycle, this));
            clog('more records are comming!');
          } else {
            clog('no more records available!');
            // end of cycle
            end = true;
          }
        }
        if (end) {
          if (this.state.order == 'none') {
            while (this.state.users.length > 0) {
              var user = this.state.users.pop();
              pipeline.register('unfollowFromList', user, $.proxy(this.unfollowResponse, this));
            }
          } else if (this.state.order == 'oldest') {
            var count = 0;
            while (count <= this.state.count && count <= this.state.users.length) {
              var user = this.state.users.pop();
              pipeline.register('unfollowFromList', user, $.proxy(this.unfollowResponse, this));
              count++;
            }
          } else {
            var count = 0,
              selectedUsers = {};
            while (count <= this.state.count && count <= this.state.users.length) {
              while (true) {
                var rnd = Math.floor(Math.random() * this.state.users.length);
                if (selectedUsers[rnd] == undefined) {
                  selectedUsers[rnd] = true;
                  var user = this.state.users[rnd];
                  pipeline.register('unfollowFromList', user, $.proxy(this.unfollowResponse, this));
                  break;
                }
              }
              count++;
            }
          }
          delete selectedUsers;
          this.state.users = [];
        }
        pipeline.next(1, 1);
      } else {
        clog('response error');
        pipeline.retry(60);
      }
    } else {
      clog('server error');
      pipeline.retry(60);
    }
  } else {
    clog('can not fetch followings');
    pipeline.retry(60);
  }
};

/**
 * پاسخ آنفالو
 */
unfollowTask.prototype.unfollowResponse = function (pipeline, msg) {
  clog('unfollow response:', msg);
  if (msg.result) {
    if (msg.response.status == 200) {
      // کاربر با موفقیت تمام شد
      updateFollowHistory(this.tabId, {
        id: msg.user.userId,
        username: msg.user.username,
        status: 'unfollowed'
      });
      pipeline.next(1, 1);
    } else {
      clog('server error:');
      pipeline.retry(60);
    }
  } else {
    //خطا
    clog('can not unfollow user');
    pipeline.retry(60);
  }
};



/*
unfollowTask.prototype.unfollowUser = function(msg){
  if(msg!=undefined){
    if(msg.result){
      // همه چیز اوکی
      updateFollowHistory(this.tabId,{
        id: this.state.currentUser.userId,
        username: this.state.currentUser.username,
        status: 'unfollowed',
        datetime: new Date().toISOString()
      });
      this.persist();
    }else{
      // خطا در آنفالو
    }
  }
  if(this.state.users.length==0){
    //پایان کار
    this.persist('completed');
    this.completed(this);
  } else {
    var user = this.state.users.pop();
    this.state.currentUser = user;
    this.pipeline.register('unfollowFromList',user,$.proxy(this.unfollowUser,this)).next();
  }

};
*/
/**
 * استخراج کاربران از تاریخچه
 */
unfollowTask.prototype.fetchFollowHistories = function () {
    this.pipeline = this.tab.createPipeline($.proxy(function () {
      clog('tasl completed',this.state);
      this.completed(this);
    }, this));
  this.tab.postMessage({
    action: 'getCurrentUser'
  }, $.proxy(function (msg) {
    if (msg.result) {
      var db = getDb(msg.user.id);
      db.followHistories
        .where('status')
        .equals('following')
        .limit(this.state.count)
        .reverse()
        .sortBy('datetime',$.proxy(function (items) {
          for(var i in items){
              var followHistory = items[i];
          clog('histry',followHistory);
          this.pipeline
              .register($.proxy(function () {
                  this.state.currentUser = followHistory;
                  this.tab.onConnect($.proxy(function () {
                      clog('connect after going to profile');
                      this.state.profileViews++;
                      this.tab.removeOnConnect();
                      this.pipeline.port = this.tab.port;
                      this.pipeline.next();
                  }, this));
                  this.pipeline.next();
              }, this))

          .register('gotoProfile', {
            username: followHistory.username
          })

          .register('getProfileInfo',{},$.proxy(this.getProfileInfoResponse,this))
          .register('unfollowFromPage',{userId:followHistory.id,username:followHistory.username},$.proxy(this.unfollowFromPageResponse,this));
          }
          this.pipeline.start();
        },this));

    } else {
      //خطا
    }
  },this));
};

unfollowTask.prototype.getProfileInfoResponse = function(pipeline,msg){
    clog('get profile info reponse',msg);
   if(msg.result){
        if(msg.user.followed_by_viewer){
            if(this.state.checkFollowStatus){
                if(!msg.user.follows_viewer){
                    clog('daoos found');
                    pipeline.next();
                }else{
                    clog('user currently follow me!');
                    pipeline.next(2);
                }
            }else{
                 clog('dont check follow status')
                 pipeline.next();
            }
        }else{

            clog('not followed: skip from follow');
            //رد شدن از آنفالو
            updateFollowHistory(this.tabId, {
                id: msg.user.id,
                username: msg.user.username,
                status: 'unfollowed'
             });
            pipeline.next(2);
        }
    }else{
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

unfollowTask.prototype.unfollowFromPageResponse = function(pipeline,msg){
    clog('unfollow response',msg);
 if(msg.result){
     if(msg.response.status == 200){
         this.state.unfollows++;
         updateFollowHistory(this.tabId, {
            id: msg.user.userId,
            username: msg.user.username,
            status: 'unfollowed'
         });
      pipeline.next(1, 1);
     }else{
         var rnd = Math.floor(Math.random()*6)+5;
         clog('block or network error, retry '+rnd+'min again',this.state);
         //بلاک شدن یا عدم اتصال به اینترنت و ..
         pipeline.previous(3,rnd*60);
     }
 }else{
     clog('follow error : skip');
     // خطا در فالو
     pipeline.next();
 }
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
