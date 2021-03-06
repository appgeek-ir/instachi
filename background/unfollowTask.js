/// <reference path="app.js" />

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
        this.state.progress = 0;
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
    if (this.forceStop()) {
        return;
    }
    this.tab.onConnect(bind(function () {
        clog('connect after going to home');
        this.tab.removeOnConnect();
        if (this.forceStop()) {
            return;
        }

        // ایجاد پایپ لاین
        this.pipeline = this.tab.createPipeline(bind(function () {
            clog('fetch completed!');
            this.completed(this);
        }, this));

        // باز کردن فالوینگ ها
        this.pipeline.register('openFollowings', {}, bind(this.fetchFollowingsCycle, this))
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
    if (this.forceStop()) {
        return;
    }
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
                        status: followStatus.following
                    });
                }

                // بررسی صفحه بعدی
                if (data.follows.page_info.has_next_page) {
                    clog('more records are comming!');
                    pipeline.register('loadMoreFollowings', {}, bind(this.fetchFollowingsCycle, this));
                    pipeline.next();
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
    if (this.forceStop()) {
        return;
    }
    // ایجاد پایپ لاین
    this.pipeline = this.tab.createPipeline(bind(function () {
        clog('task completed', this.state);
        this.completed(this);
    }, this));

    var createPipeline = bind(function (followHistory) {
        if (this.forceStop()) {
            return;
        }
        this.pipeline
            .register(bind(function () {
                this.state.currentUser = followHistory;
                this.tab.onConnect(bind(function () {
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
            .register('getProfileInfo', {}, bind(this.getProfileInfoResponse, this))
            .register('unfollowFromPage', {
                userId: followHistory.id,
                username: followHistory.username
            }, bind(this.unfollowFromPageResponse, this));
    }, this);

    this.tab.postMessage({
        action: 'getCurrentUser'
    }, bind(function (msg) {
        if (this.forceStop()) {
            return;
        }
        if (msg.result) {
            var db = getDb(msg.user.id);
            var equals = [followStatus.following];
            if (this.state.checkRequests) {
                equals.push(followStatus.requested);
            }

            db.followHistories
                .orderBy('datetime')
                .and(function(x) { return inArray(x.status, equals) != -1; })
                .limit(this.state.count)
                .toArray(bind(function (items) {
                    db.close();
                    if (this.forceStop()) {
                        return;
                    }
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
    this.state.progress = pipeline.index / pipeline.steps.length * 100;
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
                    //if (this.state.currentUser.status == followStatus.requested) {
                        updateFollowHistory(this.tabId, {
                            id: msg.user.id,
                            username: msg.user.username,
                            status: followStatus.following
                        });
                    //}
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
                pipeline.next(2);
            }

        } else {
            clog('not followed: skip from follow');
            //رد شدن از آنفالو
            updateFollowHistory(this.tabId, {
                id: msg.user.id,
                username: msg.user.username,
                status: followStatus.rejected
            });
            pipeline.next(2);
        }
    } else {
        clog('can not access: skip from follow');
        // کاربر وجود نداشت
        updateFollowHistory(this.tabId, {
            id: this.state.currentUser.id,
            username: this.state.currentUser.username,
            status: followStatus.block
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
            if (this.state.currentUser.currentState == 'following') {
                this.state.unfollowsCount++;
            } else {
                this.state.retakeRequestsCount++;
            }

            updateFollowHistory(this.tabId, {
                id: msg.user.userId,
                username: msg.user.username,
                status: followStatus.unfollowed
            });
            pipeline.next(1, 1);
        } else {
            var rnd = Math.floor(Math.random() * 6) + 5;
            clog('block or network error, retry ' + rnd + 'min again', this.state);
            //بلاک شدن یا عدم اتصال به اینترنت و ..
            var waitUntil = new Date();
            waitUntil.setSeconds(waitUntil.getSeconds() + rnd * 60);
            this.state.waitUntil = waitUntil;
            setTimeout(bind(this.endWaiting, this), rnd * 60 * 1000);

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
unfollowTask.prototype.endWaiting = function () {
    this.state.waitUntil = undefined;
}

/**
 * دریافت وضعیت وظیفه
 */
unfollowTask.prototype.getStatus = function () {
    var currentStep,
        states = [];
    switch (this.state.currentStep) {
    case 'fetchFromFollowings':
        currentStep = 'استخراج فالوینگ ها';
        states = [
            {
                name: 'تعداد کاربر استخراج شده',
                value: this.state.fetchedUsersCount
                }
            ];
        break;
    case 'fetchFollowHistories':
        currentStep = 'آنفالو کردن کاربران';
        states = [
            {
                name: 'تعداد',
                value: this.state.count
            },
            {
                name: 'صفحات باز شده',
                value: this.state.profileViewsCount
            },
            {
                name: 'کاربران آنفالو شده',
                value: this.state.unfollowsCount
            },
            {
                name: 'درخواست های پس گرفته شده',
                value: this.state.retakeRequestsCount
            }
        ];
        break;
    }

    return {
        type: 'آنفالو',
        progress: this.state.progress > 100 ? 100 : Math.floor(this.state.progress),
        step: currentStep,
        waitUntil: this.state.waitUntil != undefined ? this.state.waitUntil.toISOString() : undefined,
        states: states
    };
};

/**
 * بررسی پایان کار اجباری
 */
unfollowTask.prototype.forceStop = function () {
    return this.stopSignal;
}

/**
 * متوقف کردن وظیفه
 */
unfollowTask.prototype.stop = function () {
    this.stopSignal = true;
    if (this.pipeline != undefined) {
        this.pipeline.stop();
    }
}
