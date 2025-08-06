// New Block - Updated August 6, 2025
function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}

// Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
// at the end of hydration without touching the remaining nodes.
let is_hydrating = false;
function start_hydrating() {
    is_hydrating = true;
}
function end_hydrating() {
    is_hydrating = false;
}
function upper_bound(low, high, key, value) {
    // Return first index of value larger than input value in the range [low, high)
    while (low < high) {
        const mid = low + ((high - low) >> 1);
        if (key(mid) <= value) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
function init_hydrate(target) {
    if (target.hydrate_init)
        return;
    target.hydrate_init = true;
    // We know that all children have claim_order values since the unclaimed have been detached if target is not <head>
    let children = target.childNodes;
    // If target is <head>, there may be children without claim_order
    if (target.nodeName === 'HEAD') {
        const myChildren = [];
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            if (node.claim_order !== undefined) {
                myChildren.push(node);
            }
        }
        children = myChildren;
    }
    /*
    * Reorder claimed children optimally.
    * We can reorder claimed children optimally by finding the longest subsequence of
    * nodes that are already claimed in order and only moving the rest. The longest
    * subsequence of nodes that are claimed in order can be found by
    * computing the longest increasing subsequence of .claim_order values.
    *
    * This algorithm is optimal in generating the least amount of reorder operations
    * possible.
    *
    * Proof:
    * We know that, given a set of reordering operations, the nodes that do not move
    * always form an increasing subsequence, since they do not move among each other
    * meaning that they must be already ordered among each other. Thus, the maximal
    * set of nodes that do not move form a longest increasing subsequence.
    */
    // Compute longest increasing subsequence
    // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
    const m = new Int32Array(children.length + 1);
    // Predecessor indices + 1
    const p = new Int32Array(children.length);
    m[0] = -1;
    let longest = 0;
    for (let i = 0; i < children.length; i++) {
        const current = children[i].claim_order;
        // Find the largest subsequence length such that it ends in a value less than our current value
        // upper_bound returns first greater value, so we subtract one
        // with fast path for when we are on the current longest subsequence
        const seqLen = ((longest > 0 && children[m[longest]].claim_order <= current) ? longest + 1 : upper_bound(1, longest, idx => children[m[idx]].claim_order, current)) - 1;
        p[i] = m[seqLen] + 1;
        const newLen = seqLen + 1;
        // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
        m[newLen] = i;
        longest = Math.max(newLen, longest);
    }
    // The longest increasing subsequence of nodes (initially reversed)
    const lis = [];
    // The rest of the nodes, nodes that will be moved
    const toMove = [];
    let last = children.length - 1;
    for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
        lis.push(children[cur - 1]);
        for (; last >= cur; last--) {
            toMove.push(children[last]);
        }
        last--;
    }
    for (; last >= 0; last--) {
        toMove.push(children[last]);
    }
    lis.reverse();
    // We sort the nodes being moved to guarantee that their insertion order matches the claim order
    toMove.sort((a, b) => a.claim_order - b.claim_order);
    // Finally, we move the nodes
    for (let i = 0, j = 0; i < toMove.length; i++) {
        while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
            j++;
        }
        const anchor = j < lis.length ? lis[j] : null;
        target.insertBefore(toMove[i], anchor);
    }
}
function append_hydration(target, node) {
    if (is_hydrating) {
        init_hydrate(target);
        if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentNode !== target))) {
            target.actual_end_child = target.firstChild;
        }
        // Skip nodes of undefined ordering
        while ((target.actual_end_child !== null) && (target.actual_end_child.claim_order === undefined)) {
            target.actual_end_child = target.actual_end_child.nextSibling;
        }
        if (node !== target.actual_end_child) {
            // We only insert if the ordering of this node should be modified or the parent node is not target
            if (node.claim_order !== undefined || node.parentNode !== target) {
                target.insertBefore(node, target.actual_end_child);
            }
        }
        else {
            target.actual_end_child = node.nextSibling;
        }
    }
    else if (node.parentNode !== target || node.nextSibling !== null) {
        target.appendChild(node);
    }
}
function insert_hydration(target, node, anchor) {
    if (is_hydrating && !anchor) {
        append_hydration(target, node);
    }
    else if (node.parentNode !== target || node.nextSibling != anchor) {
        target.insertBefore(node, anchor || null);
    }
}
function detach(node) {
    if (node.parentNode) {
        node.parentNode.removeChild(node);
    }
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function init_claim_info(nodes) {
    if (nodes.claim_info === undefined) {
        nodes.claim_info = { last_index: 0, total_claimed: 0 };
    }
}
function claim_node(nodes, predicate, processNode, createNode, dontUpdateLastIndex = false) {
    // Try to find nodes in an order such that we lengthen the longest increasing subsequence
    init_claim_info(nodes);
    const resultNode = (() => {
        // We first try to find an element after the previous one
        for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                return node;
            }
        }
        // Otherwise, we try to find one before
        // We iterate in reverse so that we don't go too far back
        for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                else if (replacement === undefined) {
                    // Since we spliced before the last_index, we decrease it
                    nodes.claim_info.last_index--;
                }
                return node;
            }
        }
        // If we can't find any matching node, we create a new one
        return createNode();
    })();
    resultNode.claim_order = nodes.claim_info.total_claimed;
    nodes.claim_info.total_claimed += 1;
    return resultNode;
}
function claim_element_base(nodes, name, attributes, create_element) {
    return claim_node(nodes, (node) => node.nodeName === name, (node) => {
        const remove = [];
        for (let j = 0; j < node.attributes.length; j++) {
            const attribute = node.attributes[j];
            if (!attributes[attribute.name]) {
                remove.push(attribute.name);
            }
        }
        remove.forEach(v => node.removeAttribute(v));
        return undefined;
    }, () => create_element(name));
}
function claim_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, element);
}
function claim_text(nodes, data) {
    return claim_node(nodes, (node) => node.nodeType === 3, (node) => {
        const dataStr = '' + data;
        if (node.data.startsWith(dataStr)) {
            if (node.data.length !== dataStr.length) {
                return node.splitText(dataStr.length);
            }
        }
        else {
            node.data = dataStr;
        }
    }, () => text(data), true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
    );
}
function claim_space(nodes) {
    return claim_text(nodes, ' ');
}

let current_component;
function set_current_component(component) {
    current_component = component;
}

const dirty_components = [];
const binding_callbacks = [];
let render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = /* @__PURE__ */ Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    // Do not reenter flush while dirty components are updated, as this can
    // result in an infinite loop. Instead, let the inner flush handle it.
    // Reentrancy is ok afterwards for bindings etc.
    if (flushidx !== 0) {
        return;
    }
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        try {
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
        }
        catch (e) {
            // reset dirty state to not end up in a deadlocked state and then rethrow
            dirty_components.length = 0;
            flushidx = 0;
            throw e;
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
/**
 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
 */
function flush_render_callbacks(fns) {
    const filtered = [];
    const targets = [];
    render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
    targets.forEach((c) => c());
    render_callbacks = filtered;
}
const outroing = new Set();
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
            // if the component was destroyed immediately
            // it will update the `$$.on_destroy` reference to `null`.
            // the destructured on_destroy may still reference to the old array
            if (component.$$.on_destroy) {
                component.$$.on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        flush_render_callbacks($$.after_update);
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: [],
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            start_hydrating();
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        end_hydrating();
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        if (!is_function(callback)) {
            return noop;
        }
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

/* generated by Svelte v3.59.1 */

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[8] = list[i];
	return child_ctx;
}

// (301:8) {#each navItems as item}
function create_each_block(ctx) {
	let li;
	let button;
	let span0;
	let t0_value = /*item*/ ctx[8].icon + "";
	let t0;
	let t1;
	let span1;
	let t2_value = /*item*/ ctx[8].label + "";
	let t2;
	let button_class_value;
	let t3;
	let mounted;
	let dispose;

	function click_handler() {
		return /*click_handler*/ ctx[5](/*item*/ ctx[8]);
	}

	return {
		c() {
			li = element("li");
			button = element("button");
			span0 = element("span");
			t0 = text(t0_value);
			t1 = space();
			span1 = element("span");
			t2 = text(t2_value);
			t3 = space();
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			button = claim_element(li_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			span0 = claim_element(button_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t0 = claim_text(span0_nodes, t0_value);
			span0_nodes.forEach(detach);
			t1 = claim_space(button_nodes);
			span1 = claim_element(button_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t2 = claim_text(span1_nodes, t2_value);
			span1_nodes.forEach(detach);
			button_nodes.forEach(detach);
			t3 = claim_space(li_nodes);
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span0, "class", "nav-icon svelte-1rqi17j");
			attr(span1, "class", "nav-label");

			attr(button, "class", button_class_value = "nav-link " + (/*currentPage*/ ctx[0] === /*item*/ ctx[8].id
			? 'active'
			: '') + " svelte-1rqi17j");

			attr(li, "class", "nav-item svelte-1rqi17j");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, button);
			append_hydration(button, span0);
			append_hydration(span0, t0);
			append_hydration(button, t1);
			append_hydration(button, span1);
			append_hydration(span1, t2);
			append_hydration(li, t3);

			if (!mounted) {
				dispose = listen(button, "click", click_handler);
				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;

			if (dirty & /*currentPage*/ 1 && button_class_value !== (button_class_value = "nav-link " + (/*currentPage*/ ctx[0] === /*item*/ ctx[8].id
			? 'active'
			: '') + " svelte-1rqi17j")) {
				attr(button, "class", button_class_value);
			}
		},
		d(detaching) {
			if (detaching) detach(li);
			mounted = false;
			dispose();
		}
	};
}

// (406:43) 
function create_if_block_3(ctx) {
	let section;
	let h1;
	let t0;
	let t1;
	let p0;
	let t2;
	let t3;
	let div1;
	let div0;
	let h3;
	let t4;
	let t5;
	let p1;
	let t6;

	return {
		c() {
			section = element("section");
			h1 = element("h1");
			t0 = text("Student Progress");
			t1 = space();
			p0 = element("p");
			t2 = text("Track learning outcomes and assessment results");
			t3 = space();
			div1 = element("div");
			div0 = element("div");
			h3 = element("h3");
			t4 = text("Progress Tracking Coming Soon");
			t5 = space();
			p1 = element("p");
			t6 = text("This section will help teachers monitor student advancement through the course.");
			this.h();
		},
		l(nodes) {
			section = claim_element(nodes, "SECTION", { class: true });
			var section_nodes = children(section);
			h1 = claim_element(section_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			t0 = claim_text(h1_nodes, "Student Progress");
			h1_nodes.forEach(detach);
			t1 = claim_space(section_nodes);
			p0 = claim_element(section_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			t2 = claim_text(p0_nodes, "Track learning outcomes and assessment results");
			p0_nodes.forEach(detach);
			section_nodes.forEach(detach);
			t3 = claim_space(nodes);
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h3 = claim_element(div0_nodes, "H3", {});
			var h3_nodes = children(h3);
			t4 = claim_text(h3_nodes, "Progress Tracking Coming Soon");
			h3_nodes.forEach(detach);
			t5 = claim_space(div0_nodes);
			p1 = claim_element(div0_nodes, "P", {});
			var p1_nodes = children(p1);
			t6 = claim_text(p1_nodes, "This section will help teachers monitor student advancement through the course.");
			p1_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h1, "class", "svelte-1rqi17j");
			attr(p0, "class", "svelte-1rqi17j");
			attr(section, "class", "page-header svelte-1rqi17j");
			attr(div0, "class", "card svelte-1rqi17j");
			attr(div1, "class", "content-placeholder svelte-1rqi17j");
		},
		m(target, anchor) {
			insert_hydration(target, section, anchor);
			append_hydration(section, h1);
			append_hydration(h1, t0);
			append_hydration(section, t1);
			append_hydration(section, p0);
			append_hydration(p0, t2);
			insert_hydration(target, t3, anchor);
			insert_hydration(target, div1, anchor);
			append_hydration(div1, div0);
			append_hydration(div0, h3);
			append_hydration(h3, t4);
			append_hydration(div0, t5);
			append_hydration(div0, p1);
			append_hydration(p1, t6);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(section);
			if (detaching) detach(t3);
			if (detaching) detach(div1);
		}
	};
}

// (392:42) 
function create_if_block_2(ctx) {
	let section;
	let h1;
	let t0;
	let t1;
	let p0;
	let t2;
	let t3;
	let div1;
	let div0;
	let h3;
	let t4;
	let t5;
	let p1;
	let t6;

	return {
		c() {
			section = element("section");
			h1 = element("h1");
			t0 = text("Quizzes & Tests");
			t1 = space();
			p0 = element("p");
			t2 = text("Assessment materials for tracking student progress");
			t3 = space();
			div1 = element("div");
			div0 = element("div");
			h3 = element("h3");
			t4 = text("Assessments Coming Soon");
			t5 = space();
			p1 = element("p");
			t6 = text("This section will contain printable quizzes and tests for each module.");
			this.h();
		},
		l(nodes) {
			section = claim_element(nodes, "SECTION", { class: true });
			var section_nodes = children(section);
			h1 = claim_element(section_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			t0 = claim_text(h1_nodes, "Quizzes & Tests");
			h1_nodes.forEach(detach);
			t1 = claim_space(section_nodes);
			p0 = claim_element(section_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			t2 = claim_text(p0_nodes, "Assessment materials for tracking student progress");
			p0_nodes.forEach(detach);
			section_nodes.forEach(detach);
			t3 = claim_space(nodes);
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h3 = claim_element(div0_nodes, "H3", {});
			var h3_nodes = children(h3);
			t4 = claim_text(h3_nodes, "Assessments Coming Soon");
			h3_nodes.forEach(detach);
			t5 = claim_space(div0_nodes);
			p1 = claim_element(div0_nodes, "P", {});
			var p1_nodes = children(p1);
			t6 = claim_text(p1_nodes, "This section will contain printable quizzes and tests for each module.");
			p1_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h1, "class", "svelte-1rqi17j");
			attr(p0, "class", "svelte-1rqi17j");
			attr(section, "class", "page-header svelte-1rqi17j");
			attr(div0, "class", "card svelte-1rqi17j");
			attr(div1, "class", "content-placeholder svelte-1rqi17j");
		},
		m(target, anchor) {
			insert_hydration(target, section, anchor);
			append_hydration(section, h1);
			append_hydration(h1, t0);
			append_hydration(section, t1);
			append_hydration(section, p0);
			append_hydration(p0, t2);
			insert_hydration(target, t3, anchor);
			insert_hydration(target, div1, anchor);
			append_hydration(div1, div0);
			append_hydration(div0, h3);
			append_hydration(h3, t4);
			append_hydration(div0, t5);
			append_hydration(div0, p1);
			append_hydration(p1, t6);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(section);
			if (detaching) detach(t3);
			if (detaching) detach(div1);
		}
	};
}

// (378:41) 
function create_if_block_1(ctx) {
	let section;
	let h1;
	let t0;
	let t1;
	let p0;
	let t2;
	let t3;
	let div1;
	let div0;
	let h3;
	let t4;
	let t5;
	let p1;
	let t6;

	return {
		c() {
			section = element("section");
			h1 = element("h1");
			t0 = text("Course Content");
			t1 = space();
			p0 = element("p");
			t2 = text("Navigate through the 12-week ICDL curriculum");
			t3 = space();
			div1 = element("div");
			div0 = element("div");
			h3 = element("h3");
			t4 = text("Course Content Coming Soon");
			t5 = space();
			p1 = element("p");
			t6 = text("This section will contain the detailed weekly lessons, activities, and teacher notes.");
			this.h();
		},
		l(nodes) {
			section = claim_element(nodes, "SECTION", { class: true });
			var section_nodes = children(section);
			h1 = claim_element(section_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			t0 = claim_text(h1_nodes, "Course Content");
			h1_nodes.forEach(detach);
			t1 = claim_space(section_nodes);
			p0 = claim_element(section_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			t2 = claim_text(p0_nodes, "Navigate through the 12-week ICDL curriculum");
			p0_nodes.forEach(detach);
			section_nodes.forEach(detach);
			t3 = claim_space(nodes);
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h3 = claim_element(div0_nodes, "H3", {});
			var h3_nodes = children(h3);
			t4 = claim_text(h3_nodes, "Course Content Coming Soon");
			h3_nodes.forEach(detach);
			t5 = claim_space(div0_nodes);
			p1 = claim_element(div0_nodes, "P", {});
			var p1_nodes = children(p1);
			t6 = claim_text(p1_nodes, "This section will contain the detailed weekly lessons, activities, and teacher notes.");
			p1_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h1, "class", "svelte-1rqi17j");
			attr(p0, "class", "svelte-1rqi17j");
			attr(section, "class", "page-header svelte-1rqi17j");
			attr(div0, "class", "card svelte-1rqi17j");
			attr(div1, "class", "content-placeholder svelte-1rqi17j");
		},
		m(target, anchor) {
			insert_hydration(target, section, anchor);
			append_hydration(section, h1);
			append_hydration(h1, t0);
			append_hydration(section, t1);
			append_hydration(section, p0);
			append_hydration(p0, t2);
			insert_hydration(target, t3, anchor);
			insert_hydration(target, div1, anchor);
			append_hydration(div1, div0);
			append_hydration(div0, h3);
			append_hydration(h3, t4);
			append_hydration(div0, t5);
			append_hydration(div0, p1);
			append_hydration(p1, t6);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(section);
			if (detaching) detach(t3);
			if (detaching) detach(div1);
		}
	};
}

// (324:6) {#if currentPage === 'home'}
function create_if_block(ctx) {
	let section0;
	let div1;
	let h1;
	let t0;
	let t1;
	let p0;
	let t2;
	let t3;
	let div0;
	let button0;
	let t4;
	let t5;
	let button1;
	let t6;
	let t7;
	let section1;
	let h2;
	let t8;
	let t9;
	let div10;
	let div3;
	let div2;
	let t10;
	let t11;
	let h30;
	let t12;
	let t13;
	let p1;
	let t14;
	let t15;
	let span0;
	let t16;
	let t17;
	let div5;
	let div4;
	let t18;
	let t19;
	let h31;
	let t20;
	let t21;
	let p2;
	let t22;
	let t23;
	let span1;
	let t24;
	let t25;
	let div7;
	let div6;
	let t26;
	let t27;
	let h32;
	let t28;
	let t29;
	let p3;
	let t30;
	let t31;
	let span2;
	let t32;
	let t33;
	let div9;
	let div8;
	let t34;
	let t35;
	let h33;
	let t36;
	let t37;
	let p4;
	let t38;
	let t39;
	let span3;
	let t40;
	let mounted;
	let dispose;

	return {
		c() {
			section0 = element("section");
			div1 = element("div");
			h1 = element("h1");
			t0 = text("Welcome to ICDL Learning Hub");
			t1 = space();
			p0 = element("p");
			t2 = text("Master essential computer and digital literacy skills through our comprehensive 12-week course. \n              Designed for students aged 10-17 with interactive lessons, quizzes, and hands-on activities.");
			t3 = space();
			div0 = element("div");
			button0 = element("button");
			t4 = text("Start Learning");
			t5 = space();
			button1 = element("button");
			t6 = text("View Progress");
			t7 = space();
			section1 = element("section");
			h2 = element("h2");
			t8 = text("Course Modules");
			t9 = space();
			div10 = element("div");
			div3 = element("div");
			div2 = element("div");
			t10 = text("💻");
			t11 = space();
			h30 = element("h3");
			t12 = text("Computer Essentials");
			t13 = space();
			p1 = element("p");
			t14 = text("Learn about computers, operating systems, file management, and basic maintenance.");
			t15 = space();
			span0 = element("span");
			t16 = text("Weeks 1-4");
			t17 = space();
			div5 = element("div");
			div4 = element("div");
			t18 = text("🌐");
			t19 = space();
			h31 = element("h3");
			t20 = text("Online Essentials");
			t21 = space();
			p2 = element("p");
			t22 = text("Master internet browsing, email, online safety, and digital citizenship.");
			t23 = space();
			span1 = element("span");
			t24 = text("Weeks 5-8");
			t25 = space();
			div7 = element("div");
			div6 = element("div");
			t26 = text("📄");
			t27 = space();
			h32 = element("h3");
			t28 = text("Word Processing");
			t29 = space();
			p3 = element("p");
			t30 = text("Create and format documents, use styles, and master text editing tools.");
			t31 = space();
			span2 = element("span");
			t32 = text("Weeks 9-10");
			t33 = space();
			div9 = element("div");
			div8 = element("div");
			t34 = text("📊");
			t35 = space();
			h33 = element("h3");
			t36 = text("Spreadsheets");
			t37 = space();
			p4 = element("p");
			t38 = text("Work with data, create charts, use formulas, and organize information.");
			t39 = space();
			span3 = element("span");
			t40 = text("Weeks 11-12");
			this.h();
		},
		l(nodes) {
			section0 = claim_element(nodes, "SECTION", { class: true });
			var section0_nodes = children(section0);
			div1 = claim_element(section0_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h1 = claim_element(div1_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			t0 = claim_text(h1_nodes, "Welcome to ICDL Learning Hub");
			h1_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
			p0 = claim_element(div1_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			t2 = claim_text(p0_nodes, "Master essential computer and digital literacy skills through our comprehensive 12-week course. \n              Designed for students aged 10-17 with interactive lessons, quizzes, and hands-on activities.");
			p0_nodes.forEach(detach);
			t3 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			button0 = claim_element(div0_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			t4 = claim_text(button0_nodes, "Start Learning");
			button0_nodes.forEach(detach);
			t5 = claim_space(div0_nodes);
			button1 = claim_element(div0_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			t6 = claim_text(button1_nodes, "View Progress");
			button1_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			section0_nodes.forEach(detach);
			t7 = claim_space(nodes);
			section1 = claim_element(nodes, "SECTION", { class: true });
			var section1_nodes = children(section1);
			h2 = claim_element(section1_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t8 = claim_text(h2_nodes, "Course Modules");
			h2_nodes.forEach(detach);
			t9 = claim_space(section1_nodes);
			div10 = claim_element(section1_nodes, "DIV", { class: true });
			var div10_nodes = children(div10);
			div3 = claim_element(div10_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			t10 = claim_text(div2_nodes, "💻");
			div2_nodes.forEach(detach);
			t11 = claim_space(div3_nodes);
			h30 = claim_element(div3_nodes, "H3", { class: true });
			var h30_nodes = children(h30);
			t12 = claim_text(h30_nodes, "Computer Essentials");
			h30_nodes.forEach(detach);
			t13 = claim_space(div3_nodes);
			p1 = claim_element(div3_nodes, "P", { class: true });
			var p1_nodes = children(p1);
			t14 = claim_text(p1_nodes, "Learn about computers, operating systems, file management, and basic maintenance.");
			p1_nodes.forEach(detach);
			t15 = claim_space(div3_nodes);
			span0 = claim_element(div3_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t16 = claim_text(span0_nodes, "Weeks 1-4");
			span0_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			t17 = claim_space(div10_nodes);
			div5 = claim_element(div10_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			t18 = claim_text(div4_nodes, "🌐");
			div4_nodes.forEach(detach);
			t19 = claim_space(div5_nodes);
			h31 = claim_element(div5_nodes, "H3", { class: true });
			var h31_nodes = children(h31);
			t20 = claim_text(h31_nodes, "Online Essentials");
			h31_nodes.forEach(detach);
			t21 = claim_space(div5_nodes);
			p2 = claim_element(div5_nodes, "P", { class: true });
			var p2_nodes = children(p2);
			t22 = claim_text(p2_nodes, "Master internet browsing, email, online safety, and digital citizenship.");
			p2_nodes.forEach(detach);
			t23 = claim_space(div5_nodes);
			span1 = claim_element(div5_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t24 = claim_text(span1_nodes, "Weeks 5-8");
			span1_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			t25 = claim_space(div10_nodes);
			div7 = claim_element(div10_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);
			div6 = claim_element(div7_nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			t26 = claim_text(div6_nodes, "📄");
			div6_nodes.forEach(detach);
			t27 = claim_space(div7_nodes);
			h32 = claim_element(div7_nodes, "H3", { class: true });
			var h32_nodes = children(h32);
			t28 = claim_text(h32_nodes, "Word Processing");
			h32_nodes.forEach(detach);
			t29 = claim_space(div7_nodes);
			p3 = claim_element(div7_nodes, "P", { class: true });
			var p3_nodes = children(p3);
			t30 = claim_text(p3_nodes, "Create and format documents, use styles, and master text editing tools.");
			p3_nodes.forEach(detach);
			t31 = claim_space(div7_nodes);
			span2 = claim_element(div7_nodes, "SPAN", { class: true });
			var span2_nodes = children(span2);
			t32 = claim_text(span2_nodes, "Weeks 9-10");
			span2_nodes.forEach(detach);
			div7_nodes.forEach(detach);
			t33 = claim_space(div10_nodes);
			div9 = claim_element(div10_nodes, "DIV", { class: true });
			var div9_nodes = children(div9);
			div8 = claim_element(div9_nodes, "DIV", { class: true });
			var div8_nodes = children(div8);
			t34 = claim_text(div8_nodes, "📊");
			div8_nodes.forEach(detach);
			t35 = claim_space(div9_nodes);
			h33 = claim_element(div9_nodes, "H3", { class: true });
			var h33_nodes = children(h33);
			t36 = claim_text(h33_nodes, "Spreadsheets");
			h33_nodes.forEach(detach);
			t37 = claim_space(div9_nodes);
			p4 = claim_element(div9_nodes, "P", { class: true });
			var p4_nodes = children(p4);
			t38 = claim_text(p4_nodes, "Work with data, create charts, use formulas, and organize information.");
			p4_nodes.forEach(detach);
			t39 = claim_space(div9_nodes);
			span3 = claim_element(div9_nodes, "SPAN", { class: true });
			var span3_nodes = children(span3);
			t40 = claim_text(span3_nodes, "Weeks 11-12");
			span3_nodes.forEach(detach);
			div9_nodes.forEach(detach);
			div10_nodes.forEach(detach);
			section1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h1, "class", "svelte-1rqi17j");
			attr(p0, "class", "hero-description svelte-1rqi17j");
			attr(button0, "class", "btn btn-primary");
			attr(button1, "class", "btn btn-secondary");
			attr(div0, "class", "hero-actions svelte-1rqi17j");
			attr(div1, "class", "hero-content svelte-1rqi17j");
			attr(section0, "class", "hero svelte-1rqi17j");
			attr(h2, "class", "svelte-1rqi17j");
			attr(div2, "class", "module-icon svelte-1rqi17j");
			attr(h30, "class", "svelte-1rqi17j");
			attr(p1, "class", "svelte-1rqi17j");
			attr(span0, "class", "module-duration svelte-1rqi17j");
			attr(div3, "class", "card module-card svelte-1rqi17j");
			attr(div4, "class", "module-icon svelte-1rqi17j");
			attr(h31, "class", "svelte-1rqi17j");
			attr(p2, "class", "svelte-1rqi17j");
			attr(span1, "class", "module-duration svelte-1rqi17j");
			attr(div5, "class", "card module-card svelte-1rqi17j");
			attr(div6, "class", "module-icon svelte-1rqi17j");
			attr(h32, "class", "svelte-1rqi17j");
			attr(p3, "class", "svelte-1rqi17j");
			attr(span2, "class", "module-duration svelte-1rqi17j");
			attr(div7, "class", "card module-card svelte-1rqi17j");
			attr(div8, "class", "module-icon svelte-1rqi17j");
			attr(h33, "class", "svelte-1rqi17j");
			attr(p4, "class", "svelte-1rqi17j");
			attr(span3, "class", "module-duration svelte-1rqi17j");
			attr(div9, "class", "card module-card svelte-1rqi17j");
			attr(div10, "class", "module-grid svelte-1rqi17j");
			attr(section1, "class", "course-overview svelte-1rqi17j");
		},
		m(target, anchor) {
			insert_hydration(target, section0, anchor);
			append_hydration(section0, div1);
			append_hydration(div1, h1);
			append_hydration(h1, t0);
			append_hydration(div1, t1);
			append_hydration(div1, p0);
			append_hydration(p0, t2);
			append_hydration(div1, t3);
			append_hydration(div1, div0);
			append_hydration(div0, button0);
			append_hydration(button0, t4);
			append_hydration(div0, t5);
			append_hydration(div0, button1);
			append_hydration(button1, t6);
			insert_hydration(target, t7, anchor);
			insert_hydration(target, section1, anchor);
			append_hydration(section1, h2);
			append_hydration(h2, t8);
			append_hydration(section1, t9);
			append_hydration(section1, div10);
			append_hydration(div10, div3);
			append_hydration(div3, div2);
			append_hydration(div2, t10);
			append_hydration(div3, t11);
			append_hydration(div3, h30);
			append_hydration(h30, t12);
			append_hydration(div3, t13);
			append_hydration(div3, p1);
			append_hydration(p1, t14);
			append_hydration(div3, t15);
			append_hydration(div3, span0);
			append_hydration(span0, t16);
			append_hydration(div10, t17);
			append_hydration(div10, div5);
			append_hydration(div5, div4);
			append_hydration(div4, t18);
			append_hydration(div5, t19);
			append_hydration(div5, h31);
			append_hydration(h31, t20);
			append_hydration(div5, t21);
			append_hydration(div5, p2);
			append_hydration(p2, t22);
			append_hydration(div5, t23);
			append_hydration(div5, span1);
			append_hydration(span1, t24);
			append_hydration(div10, t25);
			append_hydration(div10, div7);
			append_hydration(div7, div6);
			append_hydration(div6, t26);
			append_hydration(div7, t27);
			append_hydration(div7, h32);
			append_hydration(h32, t28);
			append_hydration(div7, t29);
			append_hydration(div7, p3);
			append_hydration(p3, t30);
			append_hydration(div7, t31);
			append_hydration(div7, span2);
			append_hydration(span2, t32);
			append_hydration(div10, t33);
			append_hydration(div10, div9);
			append_hydration(div9, div8);
			append_hydration(div8, t34);
			append_hydration(div9, t35);
			append_hydration(div9, h33);
			append_hydration(h33, t36);
			append_hydration(div9, t37);
			append_hydration(div9, p4);
			append_hydration(p4, t38);
			append_hydration(div9, t39);
			append_hydration(div9, span3);
			append_hydration(span3, t40);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*click_handler_1*/ ctx[6]),
					listen(button1, "click", /*click_handler_2*/ ctx[7])
				];

				mounted = true;
			}
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(section0);
			if (detaching) detach(t7);
			if (detaching) detach(section1);
			mounted = false;
			run_all(dispose);
		}
	};
}

function create_fragment(ctx) {
	let div4;
	let header;
	let nav;
	let div0;
	let h1;
	let t0;
	let t1;
	let span0;
	let t2;
	let t3;
	let ul;
	let t4;
	let button;
	let span1;
	let t5;
	let main;
	let div1;
	let t6;
	let footer;
	let div3;
	let div2;
	let p0;
	let t7;
	let t8;
	let t9;
	let t10;
	let p1;
	let t11;
	let each_value = /*navItems*/ ctx[1];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	function select_block_type(ctx, dirty) {
		if (/*currentPage*/ ctx[0] === 'home') return create_if_block;
		if (/*currentPage*/ ctx[0] === 'course') return create_if_block_1;
		if (/*currentPage*/ ctx[0] === 'quizzes') return create_if_block_2;
		if (/*currentPage*/ ctx[0] === 'progress') return create_if_block_3;
	}

	let current_block_type = select_block_type(ctx);
	let if_block = current_block_type && current_block_type(ctx);

	return {
		c() {
			div4 = element("div");
			header = element("header");
			nav = element("nav");
			div0 = element("div");
			h1 = element("h1");
			t0 = text("ICDL Learning Hub");
			t1 = space();
			span0 = element("span");
			t2 = text("Interactive Computer & Digital Literacy");
			t3 = space();
			ul = element("ul");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t4 = space();
			button = element("button");
			span1 = element("span");
			t5 = space();
			main = element("main");
			div1 = element("div");
			if (if_block) if_block.c();
			t6 = space();
			footer = element("footer");
			div3 = element("div");
			div2 = element("div");
			p0 = element("p");
			t7 = text("© ");
			t8 = text(/*currentYear*/ ctx[3]);
			t9 = text(" ICDL Learning Hub. Educational Resource for Teachers.");
			t10 = space();
			p1 = element("p");
			t11 = text("Designed for students aged 10-17 • 12-week comprehensive course");
			this.h();
		},
		l(nodes) {
			div4 = claim_element(nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			header = claim_element(div4_nodes, "HEADER", { class: true });
			var header_nodes = children(header);
			nav = claim_element(header_nodes, "NAV", { class: true });
			var nav_nodes = children(nav);
			div0 = claim_element(nav_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h1 = claim_element(div0_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			t0 = claim_text(h1_nodes, "ICDL Learning Hub");
			h1_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			span0 = claim_element(div0_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t2 = claim_text(span0_nodes, "Interactive Computer & Digital Literacy");
			span0_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t3 = claim_space(nav_nodes);
			ul = claim_element(nav_nodes, "UL", { class: true });
			var ul_nodes = children(ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(ul_nodes);
			}

			ul_nodes.forEach(detach);
			t4 = claim_space(nav_nodes);
			button = claim_element(nav_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			span1 = claim_element(button_nodes, "SPAN", { class: true });
			children(span1).forEach(detach);
			button_nodes.forEach(detach);
			nav_nodes.forEach(detach);
			header_nodes.forEach(detach);
			t5 = claim_space(div4_nodes);
			main = claim_element(div4_nodes, "MAIN", { class: true });
			var main_nodes = children(main);
			div1 = claim_element(main_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			if (if_block) if_block.l(div1_nodes);
			div1_nodes.forEach(detach);
			main_nodes.forEach(detach);
			t6 = claim_space(div4_nodes);
			footer = claim_element(div4_nodes, "FOOTER", { class: true });
			var footer_nodes = children(footer);
			div3 = claim_element(footer_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			p0 = claim_element(div2_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			t7 = claim_text(p0_nodes, "© ");
			t8 = claim_text(p0_nodes, /*currentYear*/ ctx[3]);
			t9 = claim_text(p0_nodes, " ICDL Learning Hub. Educational Resource for Teachers.");
			p0_nodes.forEach(detach);
			t10 = claim_space(div2_nodes);
			p1 = claim_element(div2_nodes, "P", { class: true });
			var p1_nodes = children(p1);
			t11 = claim_text(p1_nodes, "Designed for students aged 10-17 • 12-week comprehensive course");
			p1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			footer_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h1, "class", "brand-title svelte-1rqi17j");
			attr(span0, "class", "brand-subtitle svelte-1rqi17j");
			attr(div0, "class", "nav-brand svelte-1rqi17j");
			attr(ul, "class", "nav-menu svelte-1rqi17j");
			attr(span1, "class", "hamburger");
			attr(button, "class", "mobile-menu-toggle no-print svelte-1rqi17j");
			attr(nav, "class", "nav container svelte-1rqi17j");
			attr(header, "class", "header svelte-1rqi17j");
			attr(div1, "class", "container");
			attr(main, "class", "main svelte-1rqi17j");
			attr(p0, "class", "svelte-1rqi17j");
			attr(p1, "class", "text-muted svelte-1rqi17j");
			attr(div2, "class", "footer-content svelte-1rqi17j");
			attr(div3, "class", "container");
			attr(footer, "class", "footer no-print svelte-1rqi17j");
			attr(div4, "class", "app svelte-1rqi17j");
		},
		m(target, anchor) {
			insert_hydration(target, div4, anchor);
			append_hydration(div4, header);
			append_hydration(header, nav);
			append_hydration(nav, div0);
			append_hydration(div0, h1);
			append_hydration(h1, t0);
			append_hydration(div0, t1);
			append_hydration(div0, span0);
			append_hydration(span0, t2);
			append_hydration(nav, t3);
			append_hydration(nav, ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(ul, null);
				}
			}

			append_hydration(nav, t4);
			append_hydration(nav, button);
			append_hydration(button, span1);
			append_hydration(div4, t5);
			append_hydration(div4, main);
			append_hydration(main, div1);
			if (if_block) if_block.m(div1, null);
			append_hydration(div4, t6);
			append_hydration(div4, footer);
			append_hydration(footer, div3);
			append_hydration(div3, div2);
			append_hydration(div2, p0);
			append_hydration(p0, t7);
			append_hydration(p0, t8);
			append_hydration(p0, t9);
			append_hydration(div2, t10);
			append_hydration(div2, p1);
			append_hydration(p1, t11);
		},
		p(ctx, [dirty]) {
			if (dirty & /*currentPage, navItems, navigateTo*/ 7) {
				each_value = /*navItems*/ ctx[1];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(ul, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}

			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
				if_block.p(ctx, dirty);
			} else {
				if (if_block) if_block.d(1);
				if_block = current_block_type && current_block_type(ctx);

				if (if_block) {
					if_block.c();
					if_block.m(div1, null);
				}
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(div4);
			destroy_each(each_blocks, detaching);

			if (if_block) {
				if_block.d();
			}
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;

	// Navigation state
	let currentPage = 'home';

	// Navigation items
	const navItems = [
		{ id: 'home', label: 'Home', icon: '🏠' },
		{
			id: 'course',
			label: 'Course Content',
			icon: '📚'
		},
		{
			id: 'quizzes',
			label: 'Quizzes & Tests',
			icon: '📝'
		},
		{
			id: 'progress',
			label: 'Progress',
			icon: '📊'
		}
	];

	// Handle navigation
	function navigateTo(page) {
		$$invalidate(0, currentPage = page);
	}

	// Get current year for footer
	const currentYear = new Date().getFullYear();

	const click_handler = item => navigateTo(item.id);
	const click_handler_1 = () => navigateTo('course');
	const click_handler_2 = () => navigateTo('progress');

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(4, props = $$props.props);
	};

	return [
		currentPage,
		navItems,
		navigateTo,
		currentYear,
		props,
		click_handler,
		click_handler_1,
		click_handler_2
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 4 });
	}
}

export { Component as default };
