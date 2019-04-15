import { Component, OnInit, ViewChild, ElementRef} from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { MessagingService } from '../Core/_services/messaging.service';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { AuthService } from '../Core/_services/auth.service';
import { parse } from 'flatted';


@Component({
  selector: 'app-messages',
  templateUrl: './messages.component.html',
  styleUrls: ['./messages.component.scss']
})
export class MessagesComponent implements OnInit {
  @ViewChild('avatar') avatar: ElementRef;
  fileToUpload: File;

  imagePath: any;

  notificationCount: any;


  rooms: Array<any> = [];
  currentUser: any;
  user_id: any;
  room_messages: Array<any> = [];
  // room_messages: Observable<any[]>;
  current_room: any;
  chatUser: any;

  _message = '';
  roomCreated: boolean;
  roomNotifications: Array<any> = [];
  chatkitUser: any;
  subscription: any;
  incomingMessages: any;
  get message(): string {
    return this._message;
  }
  set message(value: string) {
    this._message = value;
  }

  // TODO: Can probably remove these props
  _roomPrivate = '';
  get roomPrivate(): string {
    return this._roomPrivate;
  }
  set roomPrivate(value: string) {
    this._roomPrivate = value;
  }

  formImport = new FormGroup({
    importFileGroup: new FormGroup({
      importFile: new FormControl(''),
    }),
    roomNameGroup: new FormGroup({
      roomName: new FormControl('', [
        Validators.required,
        Validators.maxLength(60)
      ])
    }),
    privateRoomGroup: new FormGroup({
      privateRoom: new FormControl('')
    })
  });

  constructor(private http: HttpClient, private msgService: MessagingService, private _auth: AuthService) {

    this.subscription = this._auth.chatkitUser$.subscribe(
      (user) => {
        // console.log(user);
        this.chatkitUser = parse(user);
        console.log(parse(user));
        this.rooms.push(Object.entries(this.chatkitUser.roomStore.rooms));
        console.log(this.rooms);
      }
    );

    this.incomingMessages = this._auth.messages$.subscribe(
      (incomingMessage) => {
        this.room_messages.push(incomingMessage);
      }
    );

    this.current_room = this._auth.currentRoom$.subscribe(
      (currentRoom) => {
        this.current_room = currentRoom;
        console.log(currentRoom);
      }
    );

  }

  url: string;
  onFileChange(event) {
    if (!(event.target.files && event.target.files[0])) { return; }
    const file = event.target.files[0];
    this.fileToUpload = file;
    const reader = new FileReader();
    reader.readAsDataURL(file); // read file as data url
    reader.onload = (_event) => {
      console.log(reader.result); // log base64 string
      this.imagePath = reader.result;
    };
  }


  // Send a message
  sendMessage() {
    const { message, currentUser } = this;
    this.chatkitUser.sendMessage({
      text: message,
      roomId: this.current_room.id,
    }).then(res => {
      console.log(res);
    });
    this.message = '';
  }


  // Join a room
  joinRoom(roomID) {
    this.chatkitUser.joinRoom({roomId: roomID}).then(room => {
      this.current_room = room;

      // After joining room, fetch messages
      this.chatkitUser.fetchMultipartMessages({roomId: roomID}).then(messages => {

        // Check if messages
        if (messages === undefined || messages.length === 0) { return; }

        // Set read cursor
        this.chatkitUser.setReadCursor({
          roomId: this.current_room.id,
          position: messages[messages.length - 1].id
        })
        .then(() => {
          this.roomNotifications[room.id] = false;
        }); // Remove marker from notifications array
        // .then(() => {
        //     console.log('Set cursor');
        //   })
        //   .catch(err => {
        //     console.log(`Error setting cursor: ${err}`);
        //   });
        messages.forEach(message => {
          // console.log(message.parts[0].payload.content);
        });
        this.room_messages = messages;
      });
    });
  }
  // end Join room


  // Function => check if user has unread messages in a room
  hasUnread(roomID) {

    let hasUnread = false; // Track return status

    // First, check if cursor exists
    const cursor = this.chatkitUser.readCursor({
      roomId: roomID
    });

      // if read cursor ID !== latest message ID...
      this.chatkitUser.fetchMultipartMessages({ // Get latest message
        roomId: roomID,
        limit: 1,
      })
      .then(messages => {
        if (cursor) { // Has cursor so check cursor pos vs latest message id
          hasUnread = (cursor.position !== messages[0].initialId) ? true : false;
        } else {
          // No cursor => set
        }
      })
      .catch(err => {
        console.log(`Error fetching messages: ${err}`);
      });

    return hasUnread;
  }


  // Get Chatkit user
  getUser(user_id) {
    return this.http.post<any>(`${environment.apiUrl}/chatkit/getuser`, {user_id})
    .toPromise()
    .then(res => {
      return res;
      console.log(res);
    })
    .catch(error => console.log(error));
  }

  // Get Chatkit user's rooms
  getUserRooms(user_id) {
    return this.http.post<any>(`${environment.apiUrl}/chatkit/getuserrooms`, {user_id})
    .toPromise()
    .then(res => {
      // this.rooms = res;
      console.log(res);
      return res;
    })
    .catch(error => console.log(error));
  }

  //
  // ─── SUBSCRIBE TO ROOM ──────────────────────────────────────────────────────────
  //

    subscribeToRoom(roomID) {
      this.chatkitUser.subscribeToRoomMultipart({
        roomId: roomID,
        hooks: {
          onMessage: message => {
            // When a message is received...

            // Push to messages array and update view
            this.room_messages.push(message);

            // Get the users last cursor position from the room
            const cursor = this.chatkitUser.readCursor({
              roomId: message.roomId
            });

            if ((cursor.position !== message.id) && (message.roomId !== this.current_room.id)) {
              // If the current user has not seen the message, AND the message was received in a different room,
              // add marker to notification array
              this.roomNotifications[message.room.id] = true;
            } else {
              // Otherwise, message was sent in current room, so all we must do is update the
              // read cursor for the current user's room
              this.chatkitUser.setReadCursor({
                roomId: message.roomId,
                position: message.id,
              });
            }

            // Count rooms with unread notifucations
            let roomsWithNotifications = 0;
            this.roomNotifications.forEach(room => {
              roomsWithNotifications += room === true ? 1 : 0;
            });
            // Add to global notification counter
            this.msgService.setRoomsWithNotifications(roomsWithNotifications);
          },
          onAddedToRoom: room => {
            console.log(`Added to room ${room.name}`);
          }
        },
        messageLimit: 0
      });
    }
  // ────────────────────────────────────────────────────────────────────────────────


  // Create room
  createRoom() {
    this.roomCreated = true; return;
    // this.isLoading = true; // Display loading icon
    const roomName = this.formImport.value.roomNameGroup.roomName;
    const privateRoom = this.formImport.value.privateRoomGroup.privateRoom;
    const roomAvatar = this.formImport.value.importFileGroup.importFile;
    console.log(this.formImport.value.roomNameGroup.roomName);
    console.log(this.formImport.value.privateRoomGroup.privateRoom);
    console.log(this.formImport.value.importFileGroup.importFile);

    console.log(this.fileToUpload);
    console.log(this.formImport.value);

    const formData = new FormData();
    const b64string = JSON.stringify(this.imagePath);

    formData.append('file', b64string);
    formData.append('testvar', 'my test var value');

    console.log(formData);

    const headers = new HttpHeaders();
    headers.append('Content-Type', 'application/x-www-form-urlencoded');
    headers.append('Accept', 'application/json');

    // Create room and insert room avatar into database
    this.http.post(`${environment.apiUrl}/asdf`, formData)
    .toPromise()
    .then(res => { // Image uploaded
      console.log(res);

      console.log('Image uploaded');
      this.chatkitUser.createRoom({ // Create the room
        name: roomName,
        private: true,
        customData: { roomAvatar: res['_id'] },
      }).then(room => { // Success
        // this.isLoading = false;
        this.roomCreated = true;
        console.log(`Created room called ${room.name}`);
      })
      .catch(err => { // Failed room creation
        console.log(`Error creating room ${err}`);
      });
    })
    .catch(err => { // Failed image upload
      console.log('Error uploading room image');
    });
  }


  ngOnInit() {

    // console.log(this.chatkitUser);
    // console.log(this.chatkitUser.roomStore.rooms);
    console.log(this.rooms);
    console.log(this.room_messages);
    // this.chatkitUser.rooms;
    console.log(Object.keys(this.rooms));
    // this.rooms.forEach((room) => {
    //   console.log(room);
    // });


    console.log(this.rooms);

    // console.log('Connected as user ', user);
    // this.chatkitUser = user;
    // this.rooms = user.rooms;

    // Iterate through rooms and subscribe to each

    // Join first room in array
    // TODO: refactor this implementation

    // this.chatkitUser.joinRoom({roomId: this.rooms[0].id}).then(room => {
    //   this.current_room = room;


    //   // Fetch all messages for joined room
    //   this.chatkitUser.fetchMultipartMessages({
    //     roomId: this.rooms[0].id,
    //     limit: 10,
    //   }).then(messages => {
    //     messages.forEach(message => {
    //       // console.log(message.parts[0].payload.content);
    //     });
    //     this.room_messages = messages;
    //   });
    // });


  // Get user id from local storage
  const user_id = JSON.parse(localStorage.getItem('currentUser'))._embedded.user.id;

    // Subscribe to new notifications
    this.msgService.notificationCount
    .subscribe(notification => this.notificationCount = notification);
    // console.log(this.chatkitUser);
    }
}
