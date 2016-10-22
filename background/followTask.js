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
