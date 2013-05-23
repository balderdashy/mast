# Mast

## Philosophy & Goals
+ Minimize complexity
  + Make region management, DOM events, #routing, and global event delegation easy for people without any real prior knowledge of Javascript.
  + Avoid imposing a prerequisite of domain-specific Backbone knowledge when possible

+ Modularity
  + Partition off distinct logical components as possible in the core, and in how they're used at the app level:
    + DOM eventing (Backbone.View + jQuery)
    + DOM manipulation (jQuery)
    + region management (Backbone.LayoutManager)
    + global event delegation (Backbone.Event)
    + client-side #routing (Backbone.Router)
    + data management
      + server communication (Backbone)
      + local device storage (???)
      + global app state (???)
      + DOM (jQuery)
  + At the same time, don't let this modularity inhibit a simpler way of doing things from the end user perspective.

+ Minimize code
  + Allow use of shorthand notation where it makes sense
  + Opt for implicit understanding of pre-existing HTML structures where possible


## Data

+ DOM
  + The DOM itself maintains temporal state.  It can only be counted on remaining untouched until something rerenders it.
  
+ Context
  + Application state is maintained globally.  You can count on it sticking around until you refresh the page.  This is a great place to store things like the items currently loaded in various listviews, etc.  It is a free range key-value store, and you can come up with your own conventions for storing and accessing data inside of it.  While it may correspond with view state on the page, it doesn't necessarily have to.

+ *Session*
  + Session data is stuffed in LocalStorage or another storage adapter.  It represents device-specific state that should be persisted for a certain period of time.  This is a nice enhancement, but not a requirement, and could be added as a last priority.

+ Server
  + Flexible communication with a server-side API is a requirement.  It probably makes the most sense to do this in the context of either RESTful operations on models or RPC-style calls on them.  But in either case, a static collection represents a remote endpoint for performing operations and receiving server-sent events.  These are probably Backbone models and collections, but not necessarily.




<!--
## The old stuff

### What is Mast?

Productivity-enhancing front-end library based on Backbone.js.  Mast takes standard conventions you use in every Backbone project and formalizes them.  

There are 1,000 ways to build a jQuery script.  There are 100 ways to build a Backbone app.  Mast takes it to the next level, providing standard conventions for DOM development.  It was built from the ground up for creating realtime web applications that work with handsets, tablets, and PC browers.  Like Sails, Mast is a collection of the latest stable versions of really great libraries, in this case Backbone.js, jQuery, and Socket.io.


### Why Bother?
With Mast, building the front-end for your app is *faster*, *"funner"* and requires *fewer* lines of code.


## How It Works
At its core, Mast is made up of Components, Models, and Collections.  Components are very closely related to Backbone Views, and Models and Collections are exactly like their Backbone equivalents.

Mast introduces the concept of a Component, which is a minimal logical UI element which completely abstracts DOM templating. 
When you change the model, or change the template, for a component, it just works-- the screen automatically gets updated.

Mast also enhances jQuery's DOM events by adding "pressEnter", "pressEscape", and "clickoutside", as well as providing access to global events, like $(window).scroll, from the events hash (no more worrying about whether the element you're binding to has focus or not!).



## Docs
See the Wiki.

-->

The MIT License (MIT)
--

Copyright © 2012-2013 Balderdash Design Co.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

[![githalytics.com alpha](https://cruel-carlota.pagodabox.com/265f7e98e0872eaff2e2065bbe902f7d "githalytics.com")](http://githalytics.com/balderdashy/mast)
