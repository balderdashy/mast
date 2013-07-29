# Mast 2.x

> Warning ::
> Mast is an internal tool that we use at Balderdash.  We made it open-source, because... well, we like open-source software :)
> It *is* based off of Backbone, and it *does* happen to be a great accompaniment to Sails, but the last thing I want
> is to give anyone the impression you should make your front-end decision based on your back-end framework, or even that they should be connected!

> It's very important to future-proof your API/infrastructure by building an SOA.  A clean breadboard for your business logic
> powered by a fast, powerful data warehouse.  Native mobile apps, web apps, refrigerators, cars, wearables-- these things
> all speak APIs, but unfortunately they don't (and they won't for many years) all speak HTML 5.
> So please don't make decisions on a DOM framework based on your backend, or vice versa!

> OK.  Enough of that.

> I think Mast is fantastic, and it has afforded great productivity gains for my team and our customers.
> We don't yet have the resouces to provide publicly available documentation while still maintaining a professional level
> of support for our customers already using Mast. 

> So all I can say for now is "use Mast at your own risk."
> If you feel comfortable reading Backbone's source, you're probably good to go.

> Stay tuned!

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



#Getting Started with Mast
>As we said before, we don't really have the resources to provide much documentation here, but here's a brief guide to getting set up. We've included some quick tips for using it in a Sails.js (0.9.x) app, but you definitely don't need to be using Sails in order to use Mast.

##Setting up Mast
###1. Get Mast
Add the `mast.dev.js` file to your project and make sure you link to it before you link to any of your components. This file contains all of Mast's dependencies, so you don't need to have separate Backbone, jQuery and Underscore files in your application -- it's all there for you.

###2. Raise Mast 
Paste this in the head of your document after your scripts:

```html
<script type="text/javascript">
    Mast.raise();
</script>
```

##Regions
Regions are similar to view partials, in the sense that they contain a just a section of what you see in the browser. Regions are usually used for the parts of an application that will be changed out. This makes Mast especially good for putting together single-page apps, and allows you to do so using only HTML/CSS; just by switching a region's `template`, you can easily work on whichever part of the application you need to. Regions can contain other regions, so you can get as in-depth as you want.

To insert a region, add a `<region>` tag that specifies the name of the template you'll use. Then, the contents of that template will be the contents of the region. It will look something like this: 
```html
<region template="PonyPartyRegion"></region>
```


##Templates
The template is the region's content. You can create a template for your region using a `<script>` tag with a `data-id` that matches the region's `template`. It should look something like this:
```html
<script data-id="PonyPartyRegion" type="text/template">
  Stuff inside of the region
</script>
```


##Setting up Mast in a Sails.js App
Here is a quick way to get started if you're already using Sails:

1. Save `mast.dev.js` in `assets/linker/js`
2. Go to `assets/index.html` and  link to the Mast file after `<!--SCRIPTS-->`:
```html
<!--SCRIPTS-->
<script src="/linker/js/mast.dev.js"></script>
<!--SCRIPTS END-->
```

3. Instead of putting the `Mast.raise();` script in the head, go to `assets/index.html` and paste the following after `<!--SCRIPTS END-->`:
```html
<script type="text/javascript">
	 // Modify JST templates to eliminate the nasty parts of the file path
    _.each(JST, function (fn, path) {
      var id = path.match(/\/([^\/]+)\..+$/)[1];
      Mast.templates[id] = fn;
    });

    Mast.raise();
 </script>
```
This raises mast, and also sets up your templates so that you don't need to wrap them in `<script>` tags.

4. To create a template, just create a file in `linker/templates` that has the same name as your region's `template` (e.g. `PonyPartyRegion.html`).


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

#The MIT License (MIT)
--

Copyright © 2012-2013 Balderdash Design Co.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

[![githalytics.com alpha](https://cruel-carlota.pagodabox.com/265f7e98e0872eaff2e2065bbe902f7d "githalytics.com")](http://githalytics.com/balderdashy/mast)
