var Database = {
    DB_VERSION: 1,
    DB_NAME: 'restclient',

    _db: null,
    _requests: [],
    _tags: [],
    db() {
        return this._db;
    },

    get requests() {
        return this._requests;
    },

    set requests(value) {
        this._requests = value;
    },

    get tags() {
        return this._tags;
    },

    getRequest(name) {
        let request = this.requests.filter(f => f.name === name);
        if (request === undefined) {
            return undefined;
        }
        return Object.assign({}, request);
    },

    saveRequest(request) {

    },

    async init() {
        console.log(`[RESTClient][database.js]: initing database...`);
        if (this._db)
            return;
        let { storage } = await browser.storage.local.get({ storage: 'persistent' });
        console.log(`[RESTClient][database.js]: opening database in ${storage} storage`);
        let options = { version: this.DB_VERSION };
        if (storage === 'persistent') {
            options.storage = 'persistent';
        }
        console.log(`[RESTClient][database.js]: opening database ${this.DB_NAME}.`, options);
        let opener = indexedDB.open(this.DB_NAME, options);

        opener.onupgradeneeded = (event) => this._upgradeSchema(event);
        this._db = await this._requestPromise(opener);
        await this.loadRequests();
        console.log(`[RESTClient][database.js]: opened database with ${this._requests.length} requests`);
    },

    _upgradeSchema(event) {
        console.log(`[RESTClient][database.js]: upgrade from version ${event.oldVersion}`);
        let { result: db, transaction: tx } = event.target;
        let requests;
        switch (event.oldVersion) {
            case 0:
                requests = db.createObjectStore("requests");
                requests.createIndex("idxTagName", "tags", { multiEntry: true });
        }
    },

    // Note: this is resolved after the transaction is finished(!!!) mb1193394
    _requestPromise(req) {
        return new Promise((resolve, reject) => {
            req.onsuccess = (event) => resolve(event.target.result);
            req.onerror = (event) => reject(event.target.error);
        });
    },

    // Note: this is resolved after the transaction is finished(!)
    _transactionPromise(tx) {
        return new Promise((resolve, reject) => {
            let oncomplete = tx.oncomplete;
            let onerror = tx.onerror;
            tx.oncomplete = () => { resolve(); if (oncomplete) oncomplete(); };
            tx.onerror = () => { reject(); if (onerror) onerror(); };
        });
    },

    async loadRequests() {
        let tx = this._db.transaction(['requests']);
        let request = tx.objectStore('requests').getAll();
        let requests = await this._requestPromise(request);
        console.log(`[RESTClient][database.js]:${requests.length} requests in database`);

        if (requests.length === 0) {
            console.log(`[RESTClient][database.js]: the database looks empty`);
            ({ requests } = await browser.storage.local.get({ requests: [] }));
            console.log(`[RESTClient][database.js]: ${requests.length} requests found in local storage`);
            if (requests.length === 0) {
                ({ requests } = await browser.storage.sync.get({ requests: [] }));
                console.log(`[RESTClient][database.js]: ${requests.length} requests found in sync storage`);
            }
            this._requests = requests;
        }
        else
        {
            var tags = this._tags;
            _.each(requests, function(request){
                if (request.tags && Array.isArray(request.tags) && request.tags.length > 0)
                {
                    tags = _.union(tags, request.tags);
                } 
            });
            this._tags = tags;
            console.log('[RESTClient][database.js]: tags', tags);
        }
        requests.sort((a, b) => a.rowIndex - b.rowIndex);
        this._requests = requests;
    },

    async importRequests(data) {
        if (this._db === null) {
            return;
        }
        let tx = this._db.transaction(['requests'], 'readwrite');
        let imported = 0;
        console.log(`[RESTClient][database.js]: start to import favorite requests.`);
        if(!data.version)
        {
            console.log(`[RESTClient][database.js]: favorite requests from old RESTClient.`);
            for (let name in data) {
                let item = data[name];
                // item.name = name;
                item.tags = [];
                if (typeof item.overrideMimeType != 'undefined')
                {
                    delete item.overrideMimeType;
                }
                console.log(`[RESTClient][database.js]: processing ${imported}.`, item);
                try {
                    tx.objectStore('requests').put(item, name);
                }catch(e)
                {
                    console.error(e);
                }
                
                
                imported++;
            }
        }
        console.log(data);
        if(data.version && data.version == 1 && data.data && data.data.length > 0)
        {
            for (let item of data.data) {
                delete item['id'];
                tx.objectStore('requests').put(item, item.name);
                imported++;
            }
        }
        await this._transactionPromise(tx);
        console.log(`[RESTClient][database.js]: ${imported} requests imported.`);
    },
}
Database.init().then(function(){
    console.log('database inited');
    $(document).trigger('favorite-requests-loaded');
});