# Views & Layouts

## Components

Components are attached to a particular region element, which is identified by a unique selector.  Components always have a template, but sometimes you can have a template without a component, in which case a simple anonymous component is automatically generated to render it.

## Templates

Templates are loaded as script tags and held in memory.  They may contain sub-regions, and the rules for rendering those regions are as specified in the following section on "Regions."

## Regions

Regions must be unique within their siblings, and by convention, the `<region name="foo"></region>` tag is used (with the notable exception of `<body></body>` as the top-level element for single-page apps being attached built from scratch)

We attempt to automatically link regions with components by name (i.e. the region with name="foo" corresponds to the component named "foo").  If a region "foo" is located in the template for a region "bar", it can still be uniquely identified.  If a unique identity cannot be determined, an error is thrown and rendering fails.

Dependencies are infered, and subviews are rendered accordingly (i.e. if a region lies within a template, when the template is rendered, the region is magically attached, and unless this behavior is overridden in the parent component's logic, the component and/or template with the same "id" as the region is loaded and rendered)


# Data

## Remote data store communication


## Context

The convention is to keep context data as **flat** as possible.  The goal is not to maintain an elegant data structure here-- merely to capture the minimal amount of information needed to render the UI.  If a context datum you're trying to access doesn't exist, a warning is logged and the rendering fails.

This means, instead of building nested structures which represent real data relationships, it's simpler, and equally effective, to keep the data model flat.  This makes for cleaner templates.  See the example below, for instance:

## Referencing context data from templates

Templates can reference the app context, which is automatically injected.  So if the app context contains:

```javascript
{
	category: {
		id: 5,
		type: 'Science'
	},

	topic: {
		id: 2,
		name: 'Computer Science'
	},

	courses: [
		{id: 'CS101', title: 'Intro to CS'},
		{id: 'CS435', title: 'Automata Theory'},
		{id: 'CS313k', title: 'Logic, Sets, and Functions'},
		{id: 'CS305', title: 'Algorithms and Data Structures'}
	]
}
```

The template can access this data like so:

```html
<h1><%=category.type%>:<%=topic.</h1>
<a href="#topic/<%=topic.id%>">Click here to see more details</a>

```


## What about lists?  (Or "trees"?)


Consider this template:

```html
<h1><%=category.type%>:<%=topic.</h1>
<a href="#topic/<%=topic.id%>">Click here to see more details</a>
<h2>Courses</h2>
<ul>
	<% for (var course in courses) { %>
	<li>
		<strong>courses[course].id</strong>
	</li>
	<% } %>
</ul>
```

This is a simplistic way of doing a default rendering of the data, but more likely than not, it's possible you'll want to override certain pieces of behavior in the rendering here.  This lets you do stuff like fade in individual elements, etc.  Additionally, each item (or "branch") of your list needs to have the capabilities of a component.  Here's how you do it:

In this example, a new region called "courses" is defined:
```html
<h1><%=category.type%>:<%=topic.</h1>
<a href="#topic/<%=topic.id%>">Click here to see more details</a>
<h2>Courses</h2>
<ul>
	<region name="courseList" each="courses" as="course" ></region>
</ul>
```

When a region specifies an `each` attribute, it indicates that it will render its template multiple times-- exactly once for each course in the `courses` context datum.  It also provides access to a `course` attribute in the `courseList` that refers to the current course.


## Implicit templates

You can also identify a region's contents as an implicit template.  Take a look at our running example:

```html
<h1><%=category.type%>:<%=topic.</h1>
<region>
	<h2>Topic Details for <%=topic.name%>:</h2>
</region>
<h2>Courses</h2>
<ul>
	<region each="courses" as="course" >
		<li>
			<strong>course.id</strong>
		</li>
	</region>
</ul>
```

In this case, we actually omitted the `name` attribute in our regions and opted instead to include a template inline.  If a region contains any non-whitespace text, it is assumed that this is to be the HTML which will be rendered as the template.  We can still include a name if we want to be able to attach a component to this region, but we don't HAVE to, since the template can be rendered automatically.  This is a good move during prototyping, before pulling all the templates out.

> Note that `<region></region>` tags are **NOT** removed from your template before it is rendered (especially important in the above example, since `<ul>` elements are only allowed to contain `<li>` elements as per the W3C specification.)  You'll have to bear this in mind when creating your HTML.

> In the future, regions could be automatically inferred by the logic being attached to selectors.  For now, lets punt on that.