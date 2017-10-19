# Mast

Please visit the [wiki](https://github.com/balderdashy/mast/wiki) for examples and API documentation.

> Warning :: This version of Mast in this repository is no longer actively developed and maintained.  Recent efforts have instead been devoted instead to building a similar paradigm on top of Vue.js.  If you're interested in contributing, [let us know](https://sailsjs.com/contact).

## What is this..?!

Mast is a set of conventions built on top of Backbone.js.  Aside from some other nice features, it is especially good for putting together single-page apps, since it specializes in allowing you to do so without writing any JavaScript. The JavaScript you *do* write, to add interactivity, uses Backbone/jQuery.

Mast brings some of the more important contributions from frameworks like Knockout and Angular and allows you to take advantage of them using Backbone Models, Collections, and Views, with an eye towards practical, efficient development for medium to large teams.  It's not designed to replace frameworks like Angular-- rather it exists to let you do the same thing in Backbone.

Is Backbone better than Angular? I dunno-- that's a complex question.  Angular is really, really neat. But sometimes Backbone makes more sense, based on your requirements.  And that's one of the reasons this library exists.


## Is this related to Sails?

Nope! Mast is a client-side library for the browser, whereas Sails is a client-agnostic, API-oriented framework which is backend-only.  They're completely unrelated.  You can use Mast with Rails, Java, C#, Cordova, no server, whatever you want!  And of course, you can use Sails with any front-end library you like, or with a native iOS app, or as a raw API, or even from things like [household lamps](http://www.youtube.com/watch?v=OmcQZD_LIAE).

But we're the same folks who built Sails, hence the nautical name.


> Historical note:
> The early versions of Sails were very different, and at one point, Sails was even bundled with Mast included.  We learned many lessons about separation of concerns between the client and the server since then.  The projects have been separate for a long time.


## Getting Started with Mast

##Setting up Mast
###1. Grab the Mast file
Add the `mast.withDependencies.min.js` file to your project, and make sure you bring it in with a `<script>` tag before the `<script>` tags loading your components (or anything else using Mast). This file contains all of Mast's dependencies, so you don't need to have separate Backbone, jQuery and Underscore files in your application -- it's all there for you.

###2. Raise Mast

In order for Mast to work its magic on your page, you need to `raise` it.  Paste this after all your other scripts:

```html
<script type="text/javascript">
    Mast.raise();
</script>
```



## Templates
Templates are HTML blobs that are designed to represent a piece of your user interface.  They should be designed to be standalone, since you might want to put them in various places, and you want them to look right no matter where they end up.

The simplest way to create a template is by wrapping it in a `<script type="text/template"></script>` tag.  Templates should always have an id-- otherwise there's no way to look them up. We'll define our template's id by setting the script tag's `data-id` attribute.  Let's just look at an example and it will probably make sense:

```html
<script data-id="ContactForm" type="text/template">
  <form action="/contact" method="POST">
  	<label>What&apos;s your email?</label>
  	<input type="text" name="email"/>
  	<input type="submit"/>
  </form>
</script>
```



## Regions

Regions are similar to view partials, in the sense that they let you reference your templates and bring down copies where you need them.

In other words, a region is just a container where you can summon one or more of your templates.


The contents of a region can be modified/replaced using JavaScript.  This is important for doing cool stuff later.  But the best thing about regions is that you can use them to put together single-page apps WITHOUT JavaScript; using only HTML/CSS.

Regions give you a canvas to work on whichever template you want, in the proper context. Just by changing some HTML, you can bring different templates (or multiple templates) into your region, allowing you to build your CSS/HTML as if everything was interactive, long before it actually is.  And since regions can contain other regions, you can get as in-depth as you need to.



## Some quick examples

Here are three examples where regions make your life a lot easier:

### 1. Building sections of your interface that change dynamically

Let's say we're implementing a simple single-page website with a header and footer that stays the same, but a main content section that changes depending on what navigation item is clicked. This seems easy, but can be sort of a mess.  Here's how your `<body>` might look:

```html

<header>
  <ul>
    <li>Home</li>
    <li>About</li>
    <li>Contact</li>
  </ul>
</header>

<section>
  <!-- this is where the home, about, and contact sections are supposed to go -->
</section>

<footer>
  <span>&copy; 2028 Balderdash</span>
</footer>

```

So we could implement the Home page, but how are we going to do the others?  Here's what we can do with regions:

```html
<header>
  <ul>
    <li>Home</li>
    <li>About</li>
    <li>Contact</li>
  </ul>
</header>

<region template="Home"></region>

<footer>
  <span>&copy; 2028 Balderdash</span>
</footer>



<script data-id="Home" type="text/template">
<section>
  <h1>Home stuff goes here</h1>
</section>
</script>

<script data-id="About" type="text/template">
<section>
  <h1>About stuff goes here</h1>
</section>
</script>

<script data-id="News" type="text/template">
<section>
  <h1>Portfolio stuff goes here</h1>
</section>
</script>
```

Those three blocks at the bottom are our templates, and the region is where our middle section used to be.  Notice how its `template` attribute is set to `Home`?  This means that the `Home` template will be displayed.  If you change it to `About`, the `About` template will be displayed.  And so on.

Later on, you can tie these changes to interactive events using JavaScript, but for now, we're done!  The HTML/CSS is done and looks great.


### 2. Rendering a list with an unknown number of items

Let's say we need to implement a table of emails, with a search box that changes contents of the table as you type to match the criteria (i.e. start typing "Summ" and the user sees 3 or 4 emails about her vacation plans this summer)

This sounds a little tough, but let's give it a shot:

```html
<h1>MastMail</h1>

<label>Search:</label>
<input type="text" class="search-box" />

<div>
  <h2>Inbox</h2>
  <region template="Email" count="6"></region>
</div>

<!-- This template represents just ONE email in our list -->
<script data-id="Email" type="text/template">
  <div>
    <strong>From:</strong> <span>Mike</span><br/>
    <strong>Subject:</strong> <span>This vacation will BE EPIC</span><br/>
  </div>
</script>
```

This time, we used the `count` attribute.  This allows us to inject more than one copy of the template, which lets us see what our CSS/HTML implementation of the email list looks like with more or fewer items (and even when it's empty). This addresses a few important edge cases: what our list looks like with too many items (overflow), with too few items (sticky height), or no items ("Sorry, no emails found." state).  These oh-so-important details are ofttimes overlooked when "oh-shit" mode kicks in. No longer!  Onward.




###3. Referencing a common component from more than one place

So I think we should be feeling pretty good, since we've implemented all of the HTML/CSS for the single-page website and type-as-you-go search.  What more could we possibly ask for?  Well, maybe there are parts of your application that you want to re-use in more than one section, but that aren't in *every* section like, for instance, the header & footer in the first example.

Let's say we're still working on the single-page website from before. It's an event photographer's website, and one of the navigation items now goes to a "Portfolio" section. Maybe you already have a contact form in the "Home" section, but you realize that visitors should also have quick access to it while they're mesmerized by the pretty pictures.

You don't need to copy/paste the form code into the "Portfolio" section; just stick the code into a new template, and add regions to the places where you want it to be.

So your "Home" template now looks like this:
```html
<script data-id="Home" type="text/template">
  <h1>Home Page Stuff</h1>
  <p>Blah blah blah</p>

  //Your contact form will show up here.
  <region template="Contact"></region>
</script>
```

And the "Portfolio" template like this:
```html
<script data-id="Portfolio" type="text/template">
  <img src="purdy_picture_1"/>
  <img src="purdy_picture_2"/>
  <img src="purdy_picture_3"/>

  //Your contact form will show up here, too!
  <region template="Contact"></region>
</script>
```


## Making things interactive with Components
Defining components gives you the power to make things more interactive. A really cool thing about Mast, though, is that it has shortcuts to let you do some of this without writing JavaScript. Here's a quick walkthrough of how to set up components and add some simple interactivity to your app.

###Defining a Component
To create a component, make a JavaScript file in your app, and give it the same name as the template you want it to work for. Then, paste in the following bit of code, replacing `NameofTemplate` with the template you're using:
```javascript
Mast.define('NameOfTemplate', function() {
  return {
    //DO COOL STUFF IN HERE!


  };
});
```

Now that you've created the component, it's time to make your app more awesome!


###Creating Navigation for a Single-page App
To switch out the content of a region, you will first need to give that region a `data-id`. The `<region>` tag should now look something like this: `<region data-id="content" template="Home"></region>`.

Then, create a component for the template that contains that region.

Inside the function, you can define the navigation paths. First, you put a string that has the name of the path, starting with `#`. Follow that with a `:`, and then a string that has the region's `data-id@TemplateName`.
So it will look like: `'#path' : 'data-id@TemplateName'`

It's pretty simple when you see it. Here is how we would set up navigation for our example website:

```javascript
Mast.define('Body', function() {
  return {

    '#'			: 'content@Home',
    '#about'	: 'content@About',
    '#news'		: 'content@News'

  };
});
```

To navigate to the News section, for example, you can now use `<a href="#news">News</a>`.


###Adding/Removing Classes
Mast has some simple shorthand for adding, removing, and toggling classes on jQuery events. Here's an example of how that works:

Let's go back to Example 2, where we implemented a list of emails. What if, when the user clicks on an email, you want to make it look different to show that it's been selected? Then, if they click it again, you want it to go back to normal.

You could do that in regular jQuery, but Mast speeds up the process:

Once you've styled up the `.selected` class for your email div, create your component:
```javascript
Mast.define('Email', function() {
  return {

  };
});
```
Then add your `events`:
```javascript
Mast.define('Email', function() {
  return {
    events : {
      // jQuery events go here

    }
  };
});
```

The events can be any [jQuery events](http://api.jquery.com/category/events/). In this case, we'll use a `.click()` event.

In Mast, we lay out events similarly to how we set up the navigation before. First, you include a string that has the name of the event, followed by the name of the element that triggers the event. In this case, it would be `'click div'`. Then `:`, and then a string that tells it what to do. The shorthand to toggle a class is `!`, so we would put `'! .selected'`.

Altogether, it looks like:
```javascript
Mast.define('Email', function() {
  return {
    events : {

      // Toggle .selected class when the email div is clicked
      'click div'	: '! .selected'

    }
  };
});
```

####Here is a list of the different shorthand you can use:
| Secret Code      | Action |
|----------------|-----------|
| `'+ .class-name'` | Add class |
| `'- .class-name'` | Remove class|
| `'! .class-name'` | Toggle class|
| `'!!! message'`  | Alert |
| `'>>> message'`  | Log a message to the console |


## Getting rid of those ugly `<script>` tags


Mast, like Backbone, supports Underscore templates by default (basically the same thing as EJS, JST).
Aside from the shortcut method we've been discussing up until now (the `<script>` tags), you can load templates as strings or underscore-compatible functions (if you want to precompile them).
You can hook these templates up to Mast in one of two ways:

+ Set `Mast.templates.Foo = myTemplate`, where `Foo` is the desired id of your template e,g,
```javascript
Mast.templates.header = '<header>The header</header>';
Mast.templates.footer = '<footer>The footer</footer>';
```

+ Pass in a collection of templates when you call `Mast.raise()`, e.g.:
```javascript
Mast.raise({
  header: '<header>The header</header>',
  footer: '<footer>The footer</footer>'
});
```


This flexibility is crucial so that, regardless how the project is set up, you can count on Mast to work.  If you're using AMD (e.g. RequireJS), for example, you might bring in your templates with the RequireJS template plugin.  At the end of the day, you'll stuff your templates into Mast using one of the two techniques above.


## Using Mast in a Sails.js App

If you're already using Sails on the backend, here is a quick way to get started with some fancier template loading:

+ Save the `Mast.dev.js` file in `assets/linker/js`

+ In `views/layout.ejs` paste the following after `<!--SCRIPTS END-->`:
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

This makes the templates a bit easier to set up. Now when you create a file in `linker/templates`, that template's name becomes the ID with which you would reference it in a region. (e.g. `Home.html` would be brought in with `<region template="Home"></region>`)





<!--
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
-->

<!--## Data

+ DOM
  + The DOM itself maintains temporal state.  It can only be counted on remaining untouched until something rerenders it.

+ Context
  + Application state is maintained globally.  You can count on it sticking around until you refresh the page.  This is a great place to store things like the items currently loaded in various listviews, etc.  It is a free range key-value store, and you can come up with your own conventions for storing and accessing data inside of it.  While it may correspond with view state on the page, it doesn't necessarily have to.

+ *Session*
  + Session data is stuffed in LocalStorage or another storage adapter.  It represents device-specific state that should be persisted for a certain period of time.  This is a nice enhancement, but not a requirement, and could be added as a last priority.

+ Server
  + Flexible communication with a server-side API is a requirement.  It probably makes the most sense to do this in the context of either RESTful operations on models or RPC-style calls on them.  But in either case, a static collection represents a remote endpoint for performing operations and receiving server-sent events.  These are probably Backbone models and collections, but not necessarily.
-->

<!--
## The old stuff

### What is Mast?

Productivity-enhancing front-end library based on Backbone.js.  Mast takes standard conventions you use in every Backbone project and formalizes them.

There are 1,000 ways to build a jQuery script.  There are 100 ways to build a Backbone app.  Mast takes it to the next level, providing standard conventions for DOM development.  It was built from the ground up for creating realtime web applications that work with handsets, tablets, and PC browers.


### Why Bother?
With Mast, building the front-end for your app is *faster*, *"funner"* and requires *fewer* lines of code.


## How It Works
At its core, Mast is made up of Components, Models, and Collections.  Components are very closely related to Backbone Views, and Models and Collections are exactly like their Backbone equivalents.

Mast introduces the concept of a Component, which is a minimal logical UI element which completely abstracts DOM templating.
When you change the model, or change the template, for a component, it just works- the screen automatically gets updated.

Mast also enhances jQuery's DOM events by adding "pressEnter", "pressEscape", and "clickoutside", as well as providing access to global events, like $(window).scroll, from the events hash (no more worrying about whether the element you're binding to has focus or not!).



> Mast is an internal tool that we made open-source, because... well, we like open-source software :)
>
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


-->

#The MIT License (MIT)
--

Copyright © 2012-2013 Balderdash Design Co.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

[![githalytics.com alpha](https://cruel-carlota.pagodabox.com/265f7e98e0872eaff2e2065bbe902f7d "githalytics.com")](http://githalytics.com/balderdashy/Mast)
