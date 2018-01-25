/* 
    @Author Matt Yarmolich
    @Project oceanPi v1.01
    @Date 11/5/2017
*/

//Declarations for imported modules used for serving clients
var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var sock;

var ontime = require('ontime');


    

//other included values
var fs = require('fs');
var path = require('path');
var moment = require('moment');

//raspicam declarations 
var RaspiCam = require("raspicam");
var photo = new RaspiCam({
    mode: 'photo',
    output: './images/image.jpg',
    w: 180
});

var spawn = require('child_process').spawn;
var proc;

//sensor declarations
var MiniPh = require('mini-ph');
var miniPh = new MiniPh('/dev/i2c-1', 0x4a);
var ds18b20 = require('ds18b20');

//designates the app as express for serving content
app.use(express.static(__dirname + '/'));
app.use("/js", express.static(__dirname + '/js'));
//database declarations:
const sqlite3 = require('sqlite3').verbose();

//reference variable 
//var pinList = [17,27,22,5,6,13,19,26];
//constructor for GPIO pins

ontime({
    cycle: '10:00:00'
}, function (ot) {
        pin8.writeSync(0);
        ot.done()
    return;
});

ontime({
    cycle: '16:00:00'
}, function (ot) {
        pin8.writeSync(1);
        ot.done()
    return;
});




var Gpio = require('onoff').Gpio,
	pin1 = new Gpio(17, 'out'),
	pin2 = new Gpio(27, 'out'),
	pin3 = new Gpio(22, 'out'),
	pin4 = new Gpio(5, 'out'),
	pin5 = new Gpio(6, 'out'),
	pin6 = new Gpio(13, 'out'),
	pin7 = new Gpio(19, 'out'),
	pin8 = new Gpio(26, 'out');

//html serving begins here
app.get('/', function(req,res) {
    console.log("now serving index.html");
	res.sendFile(path.join(__dirname + '/index.html'));
});

//AJAX Calls begin here:
app.get('/gpio1Toggle', function(req,res) {
	if(pin1.readSync() == 1) {
        pin1.writeSync(0);
    }
    else {
        pin1.writeSync(1);
    }
});      

app.get('/alloff', function(req,res) {
    pin1.writeSync(1);
    pin2.writeSync(1);
    pin3.writeSync(1);
    pin4.writeSync(1);
    pin5.writeSync(1);
    pin6.writeSync(1);
    pin7.writeSync(1);
    pin8.writeSync(1);
});

// polling methods
app.get('/getpH', function(req,res) {
    miniPh.readPh(function (err, m) {
        if (err)
        {
            console.log(err);
        }
        else
        {
            res.send({ raw: m.raw, pH : m.ph, filter : m.filter});
        }
    });
});

app.get('/getTemp', function(req,res) { 
    let db = new sqlite3.Database('./tempDatabase.db', (err) => {
        if (err) {
            return console.error(err.message);
        }
        console.log('Connected to tempDatabase... Polling for data');

        //currently will serialize the entire temperature database for debugging
        db.serialize(() => {
          db.all(`SELECT temp as degree, TIMESTAMP as time FROM tempData`, (err, row) => {
            if (err) {
              console.error(err.message);
            }
            res.send(row);
          });
        });

        db.close((err) => {
          if (err) {
            return console.error(err.message);
          }
          console.log('Close the temp database connection.');
        });
    });
});


app.get('/pollPH', function(req,res) {
    let db = new sqlite3.Database('./pHDatabase.db', (err) => {
        if (err) {
            return console.error(err.message);
        }
        console.log('Connected to pHDatabase... Polling for data');

        //currently will serialize the entire temperature database for debugging
        db.serialize(() => {
          db.all(`SELECT pH as pH, TIMESTAMP as time FROM pHData`, (err, row) => {
            if (err) {
              console.error(err.message);
            }
            res.send(row);
          });
        });

        db.close((err) => {
          if (err) {
            return console.error(err.message);
          }
          console.log('Close the pH database connection.');
        });

    });
});

function writeTemp() {
    //declare database and log errors
    let db = new sqlite3.Database('./tempDatabase.db', (err) => {
        if (err) {
            return console.error(err.message);
        }
        console.log('Connected to tempData... Preparing to write data');

        //data input begins 
        db.serialize(function() {
            var stmt = db.prepare("INSERT INTO tempData(temp, TIMESTAMP) VALUES(?, CURRENT_TIMESTAMP)");
            var temp = (ds18b20.temperatureSync('28-0316a192ddff') * (9/5) + 32);
            stmt.run(temp); 
            stmt.finalize();
        });


        //end call for the database to close
        db.close((err) => {
          if (err) {
            return console.error(err.message);
          }
          console.log('Closed the Temp database connection.');
        });

    });
}

function writepH() {
    let db = new sqlite3.Database('./pHDatabase.db', (err) => {
        if (err) {
            return console.error(err.message);
        }
        console.log('Connected to pHDatabase... Preparing to write data');

        //data input begins 
        db.serialize(function() {
            var stmt = db.prepare("INSERT INTO pHData(pH, TIMESTAMP) VALUES(?, CURRENT_TIMESTAMP)");

            miniPh.readPh(function (err, m) {
                if (err) {
                    console.log(err);
                }
                else {
                    var pH = m.ph
                    stmt.run(pH); 
                    stmt.finalize();
                }
            });
            

        });
        //end call for the database to close
        db.close((err) => {
          if (err) {
            return console.error(err.message);
          }
          console.log('Closed the pH database connection.');
        });

    });
}


//client side Socket.IO implementation
var sockets = {};
io.on('connection', function (socket) {
    sock = socket;
    sockets[socket.id] = socket;
    console.log("Total clients connected : ", Object.keys(sockets).length);
     
    socket.on('disconnect', function() {
        delete sockets[socket.id];
     
        // no more sockets, kill the stream
        if (Object.keys(sockets).length == 0) {
            app.set('watchingFile', false);
            if (proc) proc.kill();
            fs.unwatchFile('./stream/image_stream.jpg');
        }
    });
     
    socket.on('start-stream', function() {
        startStreaming(io);
    });

    socket.on('pin1', function (name, fn) {
        if (name == 'on'){
            pin1.writeSync(1);
            socket.emit('pin1', 'on');
        }
        else if (name == 'off') {
            pin1.writeSync(0);
            socket.emit('pin1', 'off');
        }
        else {
            var status = pin1.readSync();
            fn(status);
        }
    });

    socket.on('pin2', function (name, fn) {
        if (name == 'on'){
            pin2.writeSync(1);
            socket.emit('pin2', 'on');
        }
        else if (name == 'off') {
            pin2.writeSync(0);
            socket.emit('pin2', 'off');
        }
        else {
            var status = pin2.readSync();
            fn(status);
        }
    });

    socket.on('pin3', function (name, fn) {
        if (name == 'on'){
            pin3.writeSync(1);
            socket.emit('pin3', 'on');
        }
        else if (name == 'off') {
            pin3.writeSync(0);
            socket.emit('pin3', 'off');
        }
        else {
            var status = pin3.readSync();
            fn(status);
        }
    });

    socket.on('pin4', function (name, fn) {
        if (name == 'on'){
            pin4.writeSync(1);
            socket.emit('pin4', 'on');
        }
        else if (name == 'off') {
            pin4.writeSync(0);
            socket.emit('pin4', 'off');
        }
        else {
            var status = pin4.readSync();
            fn(status);
        }
    });

    socket.on('pin5', function (name, fn) {
        if (name == 'on'){
            pin5.writeSync(1);
            socket.emit('pin5', 'on');
        }
        else if (name == 'off') {
            pin5.writeSync(0);
            socket.emit('pin5', 'off');
        }
        else {
            var status = pin5.readSync();
            fn(status);
        }
    });

    socket.on('pin6', function (name, fn) {
        if (name == 'on'){
            pin6.writeSync(1);
            socket.emit('pin6', 'on');
        }
        else if (name == 'off') {
            pin6.writeSync(0);
            socket.emit('pin6', 'off');
        }
        else {
            var status = pin6.readSync();
            fn(status);
        }
    });

    socket.on('pin7', function (name, fn) {
        if (name == 'on'){
            pin7.writeSync(1);
            socket.emit('pin7', 'on');
        }
        else if (name == 'off') {
            pin7.writeSync(0);
            socket.emit('pin7', 'off');
        }
        else {
            var status = pin7.readSync();
            fn(status);
        }
    });

    socket.on('pin8', function (name, fn) {
        if (name == 'on'){
            pin8.writeSync(1);
            socket.emit('pin8', 'on');
        }
        else if (name == 'off') {
            pin8.writeSync(0);
            socket.emit('pin8', 'off');
        }
        else {
            var status = pin8.readSync();
            fn(status);
        }
    });
    

    //sends temp data through socket
    socket.on('temp', function (name, fn) {
        //to make this better 
        var temp = (ds18b20.temperatureSync('28-0316a192ddff') * (9/5) + 32);
        fn(temp);
    });


    //pH Data Sending
    socket.on('pH', function (name, fn) {
        miniPh.readPh(function (err, m) {
                if (err) {
                    console.log(err);
                }
                else {
                    var pH = m.ph
                }
                fn(m.ph);
        });
    });
});

//Asynchronous Function Calls for Node (checked every 5 minutes)
setInterval(function() {
  console.log("I am doing my 5 minutes check");
  writeTemp();
  writepH();
  // do your stuff here
}, 5 * 60 * 1000);

//one minute server functions
setInterval(function() {
  console.log("I am doing my 1 minutes check");
  //read in file configure 

  //obtain outlets + states

  //check for temperature hysterisis setting

  writeTemp();

  writepH();
  //Poll ATO

  //camera scripts
  
}, 2 * 60 * 1000);


function readFile()
{
    var lineReader = require('readline').createInterface({
        input: require('fs').createReadStream('config.txt')
    });

    lineReader.on('line', function (line) {
        console.log('Line from file:', line);
    });
}

function checkFile()
{

    if (fs.existsSync('config.txt')) {
        //file exists
        console.log('Found file');
        readFile();
    }
    else {
        console.log('lost file');
        createFile();
    }
}

function createFile()
{
    fs.open('config.txt', 'w', function (err, file) {
        if (err) throw err;
        console.log('Saved!');

        fs.write(fd, buffer, 0, buffer.length, null, function(err) {
            if (err) throw 'error writing file: ' + err;

            fs.close(fd, function() {
                console.log('file written');
            })
        });
    });
}

//camera functions
function takePhoto()
{
    console.log("camera running");
    var args = ["-w", "640", "-h", "480", "-o", "-t", "60000 -tl 10000", "./images/%d.jpg"];
    proc = spawn('raspistill', args);
}

function stopStreaming() {
  if (Object.keys(sockets).length == 0) {
    app.set('watchingFile', false);
    if (proc) proc.kill();
    fs.unwatchFile('./images/image_stream.jpg');
  }
}

function startStreaming(io) {
  if (app.get('watchingFile')) {
    io.sockets.emit('liveStream', 'image_stream.jpg?_t=' + (Math.random() * 100000));
    return;
  }
 
  var args = ["-w", "640", "-h", "480", "-o", "./images/image_stream.jpg", "-t", "999999999", "-tl", "100"];
  proc = spawn('raspistill', args);
 
  console.log('Watching for changes...');
 
  app.set('watchingFile', true);
 
  fs.watchFile('./images/image_stream.jpg', function(current, previous) {
    io.sockets.emit('liveStream', './images/image_stream.jpg?_t=' + (Math.random() * 100000));
  })
}

//Definitions
var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
};




//run the server on a particular port
server.listen(3000, function() {
    console.log("Server listening on port 3000");
    checkFile();
});

process.on('SIGINT', function () {
    /*
    pin1.unexport();
    pin2.unexport();
    pin3.unexport();
    pin4.unexport();
    pin5.unexport();
    pin6.unexport();
    pin7.unexport();
    pin8.unexport();
    */

    process.exit();
});