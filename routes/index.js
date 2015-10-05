var gps = require("gps-tracking");
var express = require('express');
var bodyParser = require('body-parser')
var qs = require('querystring');
var router = express.Router();
var app = express();
var http = require('http');
var server = http.createServer(app);
var mongodb = require('mongodb');
var apn = require('apn');

var io = require('socket.io').listen(server);

server.listen(8080);

var MongoClient = require('mongodb').MongoClient,
  assert = require('assert');

var mongourl = 'mongodb://localhost:27017/tow';

var options = {
  'debug'                 : false, 
  'port'                  : 8090,
  'device_adapter'        : "TK103"
}

app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());

MongoClient.connect(mongourl, function(err, db) {
  assert.equal(null, err);
  console.log("Connected correctly to mongo DB server");

  var collections = {
    'pings': db.collection('pings')
  };
  io.on('connection', function(socket) {
    collections.pings.find({}).sort({inserted: -1}).limit(300).toArray(function(err, docs) {
      assert.equal(err, null);
      socket.emit('positions', {
        positions: docs
      });

    });
  });

  var server = gps.server(options, function(device, connection) {

    device.on("connected",function(data) {

      console.log("I'm a new device connected");
      return data;

    });

    device.on("login_request",function(device_id, msg_parts) {

      console.log('Hey! I want to start transmiting my position. Please accept me. My name is ' + device_id);

      this.login_authorized(true); 

      console.log("Ok, " + device_id + ", you're accepted!");

    });
    

    device.on("ping",function(data, db) {
      data.uid = this.getUID();
      console.log(data);
      io.emit('ping', data);

      //this = device
      console.log("I'm here: " + data.latitude + ", " + data.longitude + " (" + this.getUID() + ")");

      var data_to_insert = data;
      data_to_insert.uid = this.getUID();
      var cursor = collections.pings.find( { "uid": data_to_insert.uid } );
       cursor.each(function(err, doc) {
          assert.equal(err, null);
          if (doc != null) {
             console.log(doc._id);
             collections.pings.remove({_id: new mongodb.ObjectID(doc._id)});
             collections.pings.insert(data_to_insert);
          } else {
             collections.pings.insert(data_to_insert);
          }
       });
      
      //Look what informations the device sends to you (maybe velocity, gas level, etc)

      return data;

    });

     device.on("alarm",function(alarm_code, alarm_data, msg_data) {
      console.log("Help! Something happend: " + alarm_code + " (" + alarm_data.msg + ")");
    }); 

    //Also, you can listen on the native connection object
    connection.on('data', function(data) {
      //echo raw data package
      console.log(data.toString()); 
    })

  });
});

router.get('/console', function (req, res) {
  res.sendFile(__dirname + '/console.html');
});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

/* GET Hello World page. */
router.get('/helloworld', function(req, res) {
    res.render('helloworld', { title: 'Hello, World!' });
});

/* GET Userlist page. */
router.get('/driver', function(req, res) {
    var db = req.db;
    var collection = db.get('drivercollection');
    collection.find({},{},function(e,docs){
        res.render('driver', {
            "driver" : docs
        });
    });
});

/* GET New User page. */
router.get('/newuser', function(req, res) {
    res.render('newuser', { title: 'Add New User' });
});

/* POST to Add User Service */
router.post('/driver/new', function(req, res) {

    // Set our internal DB variable
    var db = req.db;
    console.log(req.body);
    // Get our form values. These rely on the "name" attributes
    var userName = req.body.username;
    var userEmail = req.body.useremail;
    var token = req.body.token;
    var area = req.body.area;
    var truck = req.body.truck;
    var uid = req.body.uid;
    var status = req.body.status;
    var rating = 5;

    // Set our collection
    var collection = db.get('drivercollection');
    // Submit to the DB
    collection.insert({
        "name" : userName,
        "email" : userEmail,
        "area" : area,
        "truck" : truck,
        "token" : token,
        "uid" : uid,
        "status" : status,
        "rating" : rating
    }, function (err, doc) {
        if (err) {
            // If it failed, return error
            res.send("There was a problem adding the information to the database.");
        }
        else {
            // And forward to success page
            res.send("pending");
        }
    });
});

router.post('/driver/status', function(req, res) {
  var token = req.body.token;
  var db = req.db;
    var collection = db.get('drivercollection');
    collection.find({ "uid": token },function(e,docs){
        if (docs[0].status == 1) {
            res.setHeader("status", "pending");
            res.send("pending");
         }else{
            res.setHeader("status", "approved");
            res.send("approved");
         };
    });
});

function sendPushToDriver(token){
  var tokens = [token],
        options = {
        gateway:'gateway.sandbox.push.apple.com',
        cert: './certs/cert.pem',
        key: './certs/key.pem',
        passphrase: '',
        production: false
      },
      // Create a connection to the service using mostly default parameters.
      service = new apn.connection(options);
      console.log(tokens);
      service.on('connected', function() {
        console.log('Connected');
      });
      service.on('transmitted', function(notification, device) {
        console.log('Notification transmitted to:' + device.token.toString('hex'));
      });
      service.on('transmissionError', function(errCode, notification, device) {
        console.error('Notification caused error: ' + errCode + ' for device ', device, notification);
        if (errCode === 8) {
          console.log('A error code of 8 indicates that the device token is invalid. This could be for a number of reasons - are you using the correct environment? i.e. Production vs. Sandbox');
        }
      });
      service.on('timeout', function() {
        console.log('Connection Timeout');
      });
      service.on('disconnected', function() {
        console.log('Disconnected from APNS');
      });
      service.on('socketError', console.error);
      // If you plan on sending identical paylods to many devices you can do something like this.
      function pushNotificationToMany() {
        console.log('Sending the same notification each of the devices with one call to pushNotification.');
        var note = new apn.notification();
        note.setAlertText("Baby your bday is really soon!!");
        note.badge = 1;
        service.pushNotification(note, tokens);
      }
      pushNotificationToMany();

}

module.exports = router;
