var map;
var devices = {}


function initialize(latLng) {
	var mapOptions = {
		center: latLng,
		zoom: 11
	};
	map = new google.maps.Map(document.getElementById('map-canvas'),
			mapOptions);
}


google.maps.event.addDomListener(window, 'load', function(){
	
});

function displayData(data){
	console.log(data);
	var button = "<button id="+data['uid']+" onclick='showModal()' class='sendPush'>Alert Driver</button>";
	$(".dataFromDriver").append(button);
}

function getDevice(uid){
	return devices[uid] || null;
}

function checkIfMapExists(latLng){
	if(!map) {
		initialize(latLng);
	}
}


function addDevice(uid, latLng){
	checkIfMapExists(latLng);

	var marker = new google.maps.Marker({
		position: latLng,
		map: map,
		animation: google.maps.Animation.DROP,
		title: 'UID: ' + uid, 
		uid: uid

	});
	marker.setMap(map);

	google.maps.event.addListener(marker, 'click', function(){
		var deviceData = getDevice(this.uid).lastData;

		displayData(deviceData);
	});

	devices[uid] = {
		uid: uid,
		marker: marker, 
		path: null
	}

	return devices[uid];
}

function checkIfDeviceExists(data){
	var uid = data.uid;

	if(typeof devices[uid] == "undefined") {
		var table = document.getElementById('driverData')
		var html = "<tr><td>"+data.driverName+"</td></tr>";
		table.innerHTML = table.innerHTML + html;
		return addDevice(uid, new google.maps.LatLng(data.latitude, data.longitude));
	}

	return devices[uid];
}

var socket = io.connect('http://localhost:8080');

socket.on('ping', function (data) {
	console.log(data);
	var device = checkIfDeviceExists(data);
	device.lastData = data;

	var position = new google.maps.LatLng(data.latitude, data.longitude);

	// device.path.getPath().push(position);
	device.marker.setPosition(position);

	socket.emit('my other event', { my: 'data' });
});

socket.on('positions', function (data) {
	var device;
	console.log(data.positions);
	data.positions = data.positions.reverse();
	$.each(data.positions, function(index, value) {
		device = checkIfDeviceExists(value);
		var position = new google.maps.LatLng(value.latitude, value.longitude);

		if(!device.path)
		{
			device.path = new google.maps.Polyline({
				path: [],
				geodesic: true,
				strokeColor: '#FF0000',
				strokeOpacity: 1.0,
				strokeWeight: 2
		  	});
		  	device.path.setMap(map);
		}

		device.marker.position = position;

		device.path.getPath().push(position);
	})

});


