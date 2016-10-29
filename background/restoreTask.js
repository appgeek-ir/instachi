

var restoreTask = function (args) {
    this.id = idGenerator();
    this.state = args;
    this.status = 'Stop';
    this.stopSignal = false;
    if (this.state.currentStep == undefined) {
        this.state.insertedRowsCount = 0;
        this.state.currentStep = 'restoreDb';
        this.state.progress = 0;
    }
}

restoreTask.prototype.persist = function (status) {
    persistTask(undefined, {
        id: this.id,
        status: status,
        state: this.state
    });
};

restoreTask.prototype.start = function (tab) {
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

restoreTask.prototype.restoreDb = function () {
    clog('restore db start');

    //محاسبه تعداد رکورد
    this.state.totalRowsCount = 0;
    for (var i in this.state.data.tables) {
        this.state.totalRowsCount += this.state.data.tables[i].contents.length;
    }
    var viewer = this.tab.getViewer();
    var db = getDb(viewer.id);
    db.transaction('rw', db.tables, bind(function () {
        if (this.forceStop()) {
            throw 'force stop';
        }
        var tables = db.tables.map(function (t) {
            return Dexie.currentTransaction.tables[t.name];
        });
        for (var i in this.state.data.tables) {
            if (this.forceStop()) {
                throw 'force stop';
            }
            var tableData = this.state.data.tables[i];
            var table = null;
            for (var t in tables) {
                if (tables[t].name == tableData.tableName) {
                    table = tables[t];
                    break;
                }
            }
            
            table.clear();
            clog('table <' + table.name + '> data is cleared');
            for (var j in tableData.contents) {
                if (this.forceStop()) {
                    throw 'force stop';
                }
                
                // اعمال تغییرات مورد نظر بر روی داده ها
                clog('add record to table :'+ table.name)
                table.add(tableData.contents[j]);
                this.state.insertedRowsCount++;
                this.state.progress = Math.floor(this.state.insertedRowsCount / this.state.totalRowsCount * 100);
            }
        }
    }, this)).then(this.createRestoreCompletedEvent(db,true))
             .catch(this.createRestoreCompletedEvent(db,false));
    
}

restoreTask.prototype.createRestoreCompletedEvent = function (db,result) {
    return bind(function (err) {
        if (err) {
            clog('error', err);
        }
        this.restoreCompleted(db, result);
    },this);
}

restoreTask.prototype.restoreCompleted = function (db, result) {
    db.close();
    if (result) {
        clog('task successfully completed');
    } else {
        clog('task failed');
    }
    this.completed(this);
}

restoreTask.prototype.completed = function () { /* nothing */ };

/**
 * بررسی پایان کار اجباری
 */
restoreTask.prototype.forceStop = function () {
    return this.stopSignal;
}


/**
 * متوقف کردن وظیفه
 */
restoreTask.prototype.stop = function () {
    this.stopSignal = true;
}

restoreTask.prototype.getStatus = function () {
    var currentStep,
        states = [];
    return {
        type: 'پشتیبان',
        progress: this.state.progress > 100 ? 100 : Math.floor(this.state.progress),
        step: 'بازگردانی',
        waitUntil: undefined,
        states: []
    };
};