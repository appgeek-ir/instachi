
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
