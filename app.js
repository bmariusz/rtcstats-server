var pem = require('pem');
var fs = require('fs');
var config = require('config');
var uuid = require('uuid');

var Store = require('./store')({
  s3: config.get('s3')
});

var WebSocketServer = require('ws').Server;

var server = null;
var wss = null;

// dumps all peerconnections to Store
function dump(url, clientid) {
    var fmt = {
        PeerConnections: {},
        url: url
    };
    Object.keys(db[url][clientid]).forEach(function(connid) {
        var conn = client.peerConnections[connid];
        fmt.PeerConnections[connid] = {
            updateLog: conn.updateLog
        };
    });
    Store.put(clientid, JSON.stringify(fmt));
    delete db[url][clientid];
}

var db = {};
pem.createCertificate({ days: 1, selfSigned: true }, function (err, keys) {
    if (err) {
        console.err('error creating cert', err);
        return;
    }
    server = require('https').Server({
        key: keys.serviceKey,
        cert: keys.certificate
    });
    server.listen(config.get('server').port);
    wss = new WebSocketServer({ server: server });

    wss.on('connection', function(client) {
        // the url the client is coming from
        var referer = client.upgradeReq.headers['origin'] + client.upgradeReq.url;
        // TODO: check against known/valid urls

        var ua = client.upgradeReq.headers['user-agent'];
        var clientid = uuid.v4();
        // TODO: separate origin and pathname (url)
        console.log(referer);

        if (!db[referer]) db[referer] = {};
        db[referer][clientid] = {
            userAgent: ua,
            peerConnections: {}
        };

        console.log('connected', ua, referer);
        client.on('message', function (msg) {
            var data = JSON.parse(msg);
            console.log(data);
            switch(data[0]) {
            case 'getStats':
                console.log(clientid, 'getStats', data[1]);
                break;
            case 'getUserMedia':
            case 'navigator.mediaDevices.getUserMedia':
                break;
            default:
                console.log(clientid, data[0], data[1], data[2]);
                if (!db[referer][clientid].peerConnections[data[1]]) {
                    db[referer][clientid].peerConnections[data[1]] = {
                        updateLog: []
                    };
                }
                db[referer][clientid].peerConnections[data[1]].updateLog.push({
                    time: new Date(),
                    type: data[0],
                    value: JSON.stringify(data[2])
                });
                break;
            }
        });

        client.on('close', function() {
            console.log('closed');
            dump(referer, clientid);
        });
    });
});

process.on('SIGINT', function() {
    var silly = {
        PeerConnections: {}
    };
    Object.keys(db).forEach(function(origin) {
        Object.keys(db[origin]).forEach(function(clientid) {
            var client = db[origin][clientid];
            Object.keys(client.peerConnections).forEach(function(connid) {
                var conn = client.peerConnections[connid];
                silly.PeerConnections[origin + '#' + clientid + '_' + connid] = {
                    updateLog: conn.updateLog
                };
            });
        });
    });
    fs.writeFileSync('dump.json', JSON.stringify(silly));
    process.exit();
});
