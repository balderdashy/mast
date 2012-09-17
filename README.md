# Mast: Sails 

### What is Mast?
The productivity-enhancing front-end library for Sails.  Mast was built from the ground up for creating realtime web applications that work with handsets, tablets, and PC browers.  Like Sails, Mast is a collection of the latest stable versions of really great libraries, in this case Backbone.js, jQuery, and Socket.io.

### Why Bother?
With Mast, building the front-end for your app is *faster*, *'funner'* and requires *fewer* lines of code.



## A Realtime App in **< 30** Lines of Code

```javascript
// This Tree brings life to the leaderboard and its items
Mast.registerTree('LeaderBoard',{
  template        : '.template-leaderboard',  // Identify an HTML template to represent the leaderboard frame
  collection      : { model: 'Leader' }       // Associate a collection with the leaderboard
  branchComponent : 'LeaderBoardItem',        // An instance of branchComponent will be created for each item in the collection
  branchOutlet    : '.item-outlet',           // A CSS selector, automatically scoped within the component, to identify where new branches should be appended
  events: {
    'click a.add-points' : function () {             // Add 5 points to the selected Leader
        var currentlySelectedItem = this.get('selected');
        currentlySelectedItem && currentlySelectedItem.set({ 
          points: currentlySelectedItem.get('points')+5 
        }); 
      }
  }
});

// This component represents a single row of the leaderboard
Mast.registerComponent('LeaderBoardItem',{
  template  : '.template-leaderboard-item',   // Identify an HTML template to represent each leaderboard item
  events    : {
    click : function () {                     // When an item is clicked on, mark it as selected
      this.parent.set({ selected: this });
    }
  }
});

Mast.raise(function () {                    // Raise the mast
  new Mast.components.LeaderBoard();        // Create an instance of the LeaderBoard
});
```

And here's an example of the server-side, assuming you're using Sails: 

*/models/Leader.js*
```javascript
Leader = Model.extend({
  name    : STRING,
  points  : { type: INT, defaultValue: 0 }
});
```

That's it!




## Key Benefits

- Convention over configuration.
  - assumes reasonable defaults to make getting an app off the ground as painless as possible
  - for every assumption, Sails provides an override, allowing you to get as customized as you like

- Live page updates.
  - changing the Model changes the screen
  - automatic event binding and templating
  - sane rendering defaults help you get up and running fast
  - when you're ready, and if performance demands it, override default rendering with your own custom methods

- WebSockets first.
  - uses Socket.io for all server communication
  - when WebSockets is not available, Socket.io falls back to other transports:
    - Adobe Flash Socket
    - AJAX long polling
    - AJAX multipart streaming
    - Forever iframe
    - JSONP polling

- Latency compensation.
  - when a change is made, the DOM is updated automatically, preventing most common UI race conditions
  - display a customizable loading spinner as soon as changes are initiated
  - when the server confirms that a change was made to the persistent model, a trappable event is fired, and the DOM updates again

- Built-in authentication.
  - all server-side communication, even the simplest, runs through Sails' authentication system
  - role-based security is built in through a simple config file (permissions.js)
  - more advanced security schemes can be injected using standard ExpressJS middleware semantics

- Dependency management.
  - unlike Backbone alone, Mast definitions are commutative (order doesn't matter)
  - also keeps track of dependencies and inheritance relationships
  - that means you can put your code into one -or- multiple files and import them any way you like




## How It Works
At its core, Mast is made up of Components, Models, and Collections.  Components are very closely related to Backbone Views, and Models and Collections are exactly like their Backbone equivalents.

Mast introduces the concept of a Component, which is a minimal logical UI element which completely abstracts DOM templating. 
When you change the model, or change the template, for a component, it just works-- the screen automatically gets updated.

Mast also enhances jQuery's DOM events by adding "pressEnter", "pressEscape", and "clickoutside", as well as providing access to global events, like $(window).scroll, from the events hash (no more worrying about whether the element you're binding to has focus or not!).



## Docs
See the Wiki.




## Who Built This?
Sails and Mast are developed and supported by Balderdash.  We build wonderful web apps as a service, and after much frustration, we built Sails to use on our customers' projects.  Naturally, we open-sourced it.  Hopefully, it makes your life a little bit easier!