import React, { Component } from 'react';
import { Text, View, Dimensions, Animated, ScrollView, ViewPropTypes, TouchableOpacity } from 'react-native';
import PropTypes from 'prop-types';
import XDate from 'xdate';
import memoizeOne from 'memoize-one';

import { parseDate, xdateToData, padNumber } from '../interface';
import dateutils from '../dateutils';
import CalendarList from '../calendar-list';
import ReservationsList from './reservation-list';
import styleConstructor from './style';
import { VelocityTracker } from '../input';


const MINIMISED_CALENDAR_HEIGHT = 94;
const MAXIMISED_CALENDAR_HEIGHT = 404;
const WEEK_ROW_HEIGHT = 48;
const CALENDAR_TOGGLE_THRESHOLD = 15;
const KNOB_HEIGHT = 24;
//Fallback when RN version is < 0.44
const viewPropTypes = ViewPropTypes || View.propTypes;

/**
 * @description: Agenda component
 * @extends: CalendarList
 * @extendslink: docs/CalendarList
 * @example: https://github.com/wix/react-native-calendars/blob/master/example/src/screens/agenda.js
 * @gif: https://github.com/wix/react-native-calendars/blob/master/demo/agenda.gif
 */
export default class AgendaView extends Component {
  static displayName = 'Agenda';

  static propTypes = {
    /** Specify theme properties to override specific styles for calendar parts. Default = {} */
    theme: PropTypes.object,
    /** agenda container style */
    style: viewPropTypes.style,
    /** the list of items that have to be displayed in agenda. If you want to render item as empty date
    the value of date key has to be an empty array []. If there exists no value for date key it is
    considered that the date in question is not yet loaded */
    items: PropTypes.object,
    /** callback that gets called when items for a certain month should be loaded (month became visible) */
    loadItemsForMonth: PropTypes.func,
    /** callback that fires when the calendar is opened or closed */
    onCalendarToggled: PropTypes.func,
    /** callback that gets called on day press */
    onDayPress: PropTypes.func,
    /** callback that gets called when day changes while scrolling agenda list */
    onDaychange: PropTypes.func,
    /** specify how each item should be rendered in agenda */
    renderItem: PropTypes.func,
    /** specify how each date should be rendered. day can be undefined if the item is not first in that day. */
    renderDay: PropTypes.func,
    /** specify how agenda knob should look like */
    renderKnob: PropTypes.func,
    /** specify how empty date content with no items should be rendered */
    renderEmptyDay: PropTypes.func,
    /** specify what should be rendered instead of ActivityIndicator */
    renderEmptyData: PropTypes.func,
    /** specify your item comparison function for increased performance */
    rowHasChanged: PropTypes.func,
    /** Max amount of months allowed to scroll to the past. Default = 50 */
    pastScrollRange: PropTypes.number,
    /** Max amount of months allowed to scroll to the future. Default = 50 */
    futureScrollRange: PropTypes.number,
    /** initially selected day */
    selected: PropTypes.any,
    /** Minimum date that can be selected, dates before minDate will be grayed out. Default = undefined */
    minDate: PropTypes.any,
    /** Maximum date that can be selected, dates after maxDate will be grayed out. Default = undefined */
    maxDate: PropTypes.any,
    /** If firstDay=1 week starts from Monday. Note that dayNames and dayNamesShort should still start from Sunday. */
    firstDay: PropTypes.number,
    /** Collection of dates that have to be marked. Default = items */
    markedDates: PropTypes.object,
    /** Optional marking type if custom markedDates are provided */
    markingType: PropTypes.string,/* 
    /** Hide knob button. Default = false */
    hideKnob: PropTypes.bool,
    /** Month format in calendar title. Formatting values: http://arshaw.com/xdate/#Formatting */
    monthFormat: PropTypes.string,
    /** A RefreshControl component, used to provide pull-to-refresh functionality for the ScrollView. */
    refreshControl: PropTypes.element,
    /** If provided, a standard RefreshControl will be added for "Pull to Refresh" functionality. Make sure to also set the refreshing prop correctly. */
    onRefresh: PropTypes.func,
    /** Set this true while waiting for new data from a refresh. */
    refreshing: PropTypes.bool,
    /** Display loading indicador. Default = false */
    displayLoadingIndicator: PropTypes.bool,
    /** props passed to ReservationsList Component */
    ReservationsListProps: PropTypes.object,
  };

  constructor(props) {
    super(props);

    this.styles = styleConstructor(props.theme);

    const windowSize = Dimensions.get('window');
    this.viewHeight = windowSize.height;
    this.viewWidth = windowSize.width;
    this.scrollTimeout = undefined;
    this.headerState = 'idle';

    this.state = {
      scrollY: new Animated.Value(0),
      calendarIsReady: false,
      calendarScrollable: false,
      firstResevationLoad: false,
      selectedDay: parseDate(this.props.selected) || XDate(true),
      topDay: parseDate(this.props.selected) || XDate(true),
      calendarContainerHeight: new Animated.Value(0),
      expanded: false,
    };

    this.currentMonth = this.state.selectedDay.clone();
    this.onLayout = this.onLayout.bind(this);
    this.onScrollPadLayout = this.onScrollPadLayout.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    this.onStartDrag = this.onStartDrag.bind(this);
    this.onSnapAfterDrag = this.onSnapAfterDrag.bind(this);
    this.generateMarkings = this.generateMarkings.bind(this);
    this.knobTracker = new VelocityTracker();
    this.state.scrollY.addListener(({ value }) => this.knobTracker.add(value));

    this.state.calendarContainerHeight.addListener(() => {
      if (!this.verticalScrollRef) return

      const selectedDay = xdateToData(this.state.selectedDay);
      const currentWeekOffset = this.memoizedOffset(selectedDay.dateString);

      const EXPANDED_HEIGHT = 322;
      const target = this.state.calendarContainerHeight.interpolate({
        inputRange: [MINIMISED_CALENDAR_HEIGHT, EXPANDED_HEIGHT],
        outputRange: [currentWeekOffset, 0],
        extrapolate: 'clamp',
      });

      const y = target.__getValue()
      this.verticalScrollRef.scrollTo({ y, animated: false });
    });
  }

  calculateWeekOffset = (dateString) => {
    const current = xdateToData(parseDate(dateString));
    const currentWeek = (current.day % 7 === 0) ? current.day / 7 : Math.floor(current.day / 7) + 1;
    return currentWeekOffset = currentWeek * WEEK_ROW_HEIGHT;
  };

  memoizedOffset = memoizeOne(this.calculateWeekOffset);

  componentWillUnmount = () => {
    this.state.scrollY.removeAllListeners();
    this.state.calendarContainerHeight.removeAllListeners();
  }

  calendarOffset() {
    // return 90 - (this.viewHeight / 2);
    return 10
  }

  initialScrollPadPosition() {
    return Math.max(0, this.viewHeight - MINIMISED_CALENDAR_HEIGHT);
  }

  setScrollPadPosition(y, animated) {
    this.scrollPad._component.scrollTo({ x: 0, y, animated });
  }

  onScrollPadLayout() {
    // When user touches knob, the actual component that receives touch events is a ScrollView.
    // It needs to be scrolled to the bottom, so that when user moves finger downwards,
    // scroll position actually changes (it would stay at 0, when scrolled to the top).
    this.setScrollPadPosition(this.initialScrollPadPosition(), false);
    // delay rendering calendar in full height because otherwise it still flickers sometimes
    setTimeout(() => this.setState({ calendarIsReady: true }), 0);
  }

  onLayout(event) {
    this.viewHeight = event.nativeEvent.layout.height;
    this.viewWidth = event.nativeEvent.layout.width;
    this.forceUpdate();
  }

  onTouchStart() {
    this.headerState = 'touched';
    if (this.knob) {
      this.knob.setNativeProps({ style: { opacity: 0.5 } });
    }
  }

  onTouchEnd() {
    if (this.knob) {
      this.knob.setNativeProps({ style: { opacity: 1 } });
    }

    if (this.headerState === 'touched') {
      this.setScrollPadPosition(0, true);
      this.enableCalendarScrolling();
    }

    this.headerState = 'idle';
  }

  onStartDrag() {
    this.headerState = 'dragged';
    this.knobTracker.reset();
  }

  onSnapAfterDrag(e) {
    // on Android onTouchEnd is not called if dragging was started
    this.onTouchEnd();
    const currentY = e.nativeEvent.contentOffset.y;
    this.knobTracker.add(currentY);
    const projectedY = currentY + this.knobTracker.estimateSpeed() * 250/*ms*/;
    const maxY = this.initialScrollPadPosition();
    const snapY = (projectedY > maxY / 2) ? maxY : 0;
    this.setScrollPadPosition(snapY, true);

    if (snapY === 0) {
      this.enableCalendarScrolling();
    }
  }

  onVisibleMonthsChange(months) {
    if (this.props.items && !this.state.firstResevationLoad) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = setTimeout(() => {
        if (this.props.loadItemsForMonth && this._isMounted) {
          const month = months[0];
          const isCurrentMonth = dateutils.sameDate(parseDate(month.dateString), XDate())
          const scrollToDay = isCurrentMonth ? month.dateString : `${month.year}-${padNumber(month.month)}-01`;
          this.chooseDay(scrollToDay)
          this.props.loadItemsForMonth(month);
        }
      }, 200);
    }
  }

  loadReservations(props) {
    if ((!props.items || !Object.keys(props.items).length) && !this.state.firstResevationLoad) {
      this.setState({
        firstResevationLoad: true
      }, () => {
        if (this.props.loadItemsForMonth) {
          this.props.loadItemsForMonth(xdateToData(this.state.selectedDay));
        }
      });
    }
  }

  componentWillMount() {
    this._isMounted = true;
    this.loadReservations(this.props);
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  componentWillReceiveProps(props) {
    if (props.items) {
      this.setState({
        firstResevationLoad: false
      });
    } else {
      this.loadReservations(props);
    }
  }

  enableCalendarScrolling() {
    this.setState({
      calendarScrollable: true
    });

    if (this.props.onCalendarToggled) {
      this.props.onCalendarToggled(true);
    }
    // Enlarge calendarOffset here as a workaround on iOS to force repaint.
    // Otherwise the month after current one or before current one remains invisible.
    // The problem is caused by overflow: 'hidden' style, which we need for dragging
    // to be performant.
    // Another working solution for this bug would be to set removeClippedSubviews={false}
    // in CalendarList listView, but that might impact performance when scrolling
    // month list in expanded CalendarList.
    // Further info https://github.com/facebook/react-native/issues/1831
    this.calendar.scrollToDay(this.state.selectedDay, this.calendarOffset() + 1, true);
  }

  handlePressResetDay = () => {
    this.chooseDay(this.currentMonth)
  }

  _chooseDayFromCalendar(d) {
    this.chooseDay(d, !this.state.calendarScrollable);
  }

  chooseDay(d, optimisticScroll) {
    const day = parseDate(d);

    this.setState({
      calendarScrollable: false,
      selectedDay: day.clone()
    });

    if (this.props.onCalendarToggled) {
      this.props.onCalendarToggled(false);
    }

    if (!optimisticScroll) {
      this.setState({
        topDay: day.clone()
      });
    }

    // this.setScrollPadPosition(this.initialScrollPadPosition(), true);
    // this.calendar.scrollToDay(day, this.calendarOffset(), true);

    if (this.props.loadItemsForMonth) {
      this.props.loadItemsForMonth(xdateToData(day));
    }

    if (this.props.onDayPress) {
      this.props.onDayPress(xdateToData(day));
    }
  }

  handleListScroll = (scrollposition) => {
    if (!this.state.expanded && scrollposition < -CALENDAR_TOGGLE_THRESHOLD) {
      this.handleToggle()
      return;
    }
    if (this.state.expanded && scrollposition > CALENDAR_TOGGLE_THRESHOLD / 2.5) {
      this.handleToggle()
    }
  };

  renderReservations() {
    return (
      <ReservationsList
        refreshControl={this.props.refreshControl}
        refreshing={this.props.refreshing}
        onRefresh={this.props.onRefresh}
        rowHasChanged={this.props.rowHasChanged}
        renderItem={this.props.renderItem}
        renderDay={this.props.renderDay}
        renderEmptyDate={this.props.renderEmptyDate}
        reservations={this.props.items}
        selectedDay={this.state.selectedDay}
        renderEmptyData={this.props.renderEmptyData}
        topDay={this.state.topDay}
        onDayChange={this.onDayChange.bind(this)}
        onScroll={this.handleListScroll}
        ref={(c) => this.list = c}
        theme={this.props.theme}
        {...this.props.ReservationsListProps}
      />
    );
  }

  onDayChange(day, f = true) {
    const newDate = parseDate(day);
    const withAnimation = dateutils.sameMonth(newDate, this.state.selectedDay);

    this.calendar.scrollToDay(day, this.calendarOffset(), withAnimation && f);
    this.setState({
      selectedDay: parseDate(day)
    });

    if (this.props.onDayChange) {
      this.props.onDayChange(xdateToData(newDate));
    }
  }

  generateMarkings() {
    let markings = this.props.markedDates;

    if (!markings) {
      markings = {};
      Object.keys(this.props.items || {}).forEach(key => {
        if (this.props.items[key] && this.props.items[key].length) {
          markings[key] = { marked: true };
        }
      });
    }

    const key = this.state.selectedDay.toString('yyyy-MM-dd');
    return { ...markings, [key]: { ...(markings[key] || {}), ...{ selected: true } } };
  }

  handleToggle = () => {
    this.setState(({ expanded }) => ({ expanded: !expanded }), () => {
      Animated.spring(this.state.scrollY, {
        toValue: this.state.expanded ? MAXIMISED_CALENDAR_HEIGHT : 10,
        duration: 225,
      }).start();
    });
  }

  render() {
    const agendaHeight = Math.max(0, this.viewHeight - MINIMISED_CALENDAR_HEIGHT);
    const weekDaysNames = dateutils.weekDayNames(this.props.firstDay);

    const selectedDay = xdateToData(this.state.selectedDay);
    const currentWeekOffset = this.memoizedOffset(selectedDay.dateString);

    const weekdaysStyle = [this.styles.weekdays, {
      opacity: this.state.scrollY.interpolate({
        inputRange: [0, MAXIMISED_CALENDAR_HEIGHT],
        outputRange: [1, 0],
        extrapolate: 'clamp'
      }),
      transform: [{
        translateY: this.state.scrollY.interpolate({
          inputRange: [0, MAXIMISED_CALENDAR_HEIGHT],
          // show weekdays for all week rows except first one
          outputRange: [currentWeekOffset === WEEK_ROW_HEIGHT ? 0 : currentWeekOffset, -MINIMISED_CALENDAR_HEIGHT],
          extrapolate: 'clamp'
        })
      }]
    }];

    const headerHeight = this.state.scrollY.interpolate({
      inputRange: [0, agendaHeight],
      outputRange: [MINIMISED_CALENDAR_HEIGHT, MAXIMISED_CALENDAR_HEIGHT],
      extrapolate: 'clamp'
    });

    // if (!this.state.calendarIsReady) {
    // limit header height until everything is setup for calendar dragging
    // headerStyle.push({ height: 0 });
    // fill header with appStyle.calendarBackground background to reduce flickering
    // weekdaysStyle.push({ height: MINIMISED_CALENDAR_HEIGHT });
    // }

    // const shouldAllowDragging = !this.props.hideKnob && !this.state.calendarScrollable;
    // const scrollPadPosition = (shouldAllowDragging ? MINIMISED_CALENDAR_HEIGHT : 0) - KNOB_HEIGHT;

    // const scrollPadStyle = {
    //   position: 'absolute',
    //   width: 80,
    //   height: KNOB_HEIGHT,
    //   top: scrollPadPosition,
    //   left: (this.viewWidth - 80) / 2
    // };

    // let knob = (<View style={this.styles.knobContainer} />);

    // if (!this.props.hideKnob) {
    //   const knobView = this.props.renderKnob ? this.props.renderKnob() : (<View style={this.styles.knob} />);
    //   knob = this.state.calendarScrollable ? null : (
    //     <View style={this.styles.knobContainer}>
    //       <View ref={(c) => this.knob = c}>{knobView}</View>
    //     </View>
    //   );
    // }

    return (
      <View onLayout={this.onLayout} style={[this.props.style, { flex: 1, overflow: 'hidden' }]}>
        <Animated.View style={{ height: headerHeight }}>

          <Animated.View style={this.styles.knobContainer}>
            <TouchableOpacity onPress={this.handlePressResetDay}>
              <Text style={{ color: '#367eb2', paddingHorizontal: 16 }}>Today</Text>
            </TouchableOpacity>
            <View style={this.styles.knob} />
            <TouchableOpacity onPress={this.props.onPressRefresh}>
              <Text style={{ color: '#367eb2', paddingHorizontal: 16 }}>Refresh</Text>
            </TouchableOpacity>
          </Animated.View>

          <ScrollView
            bounces={false}
            ref={(instance) => this.verticalScrollRef = instance}
            scrollEnabled={false}
            style={{ backgroundColor: 'white' }}
            // snapToAlignment="start"
            // snapToOffsets={[73, 74 + 50, 75 + 100, 76 + 150, 77 + 200, 78 + 250]}
            showsVerticalScrollIndicator={false}
            onLayout={Animated.event([{
              nativeEvent: {
                layout: { height: this.state.calendarContainerHeight }
              }
            }])}
          >
            <Animated.View style={weekdaysStyle}>
              {this.props.showWeekNumbers && <Text allowFontScaling={false} style={this.styles.weekday} numberOfLines={1}></Text>}
              {weekDaysNames.map((day, index) => (
                <Text allowFontScaling={false} key={day + index} style={this.styles.weekday} numberOfLines={1}>{day}</Text>
              ))}
            </Animated.View>
            <CalendarList
              horizontal
              pagingEnabled
              scrollEnabled={this.state.expanded}
              theme={this.props.theme}
              calendarWidth={this.viewWidth}
              ref={(c) => this.calendar = c}
              minDate={this.props.minDate}
              maxDate={this.props.maxDate}
              current={this.currentMonth}
              markedDates={this.generateMarkings()}
              markingType={this.props.markingType}
              removeClippedSubviews={this.props.removeClippedSubviews}
              onDayPress={this._chooseDayFromCalendar.bind(this)}
              scrollingEnabled={this.state.calendarScrollable}
              hideExtraDays={this.state.calendarScrollable}
              firstDay={this.props.firstDay}
              monthFormat={this.props.monthFormat}
              pastScrollRange={this.props.pastScrollRange}
              futureScrollRange={this.props.futureScrollRange}
              dayComponent={this.props.dayComponent}
              disabledByDefault={this.props.disabledByDefault}
              displayLoadingIndicator={this.props.displayLoadingIndicator}
              showWeekNumbers={this.props.showWeekNumbers}
              onVisibleMonthsChange={this.onVisibleMonthsChange.bind(this)}
            // onLayout={() => {
            //   this.calendar.scrollToDay(this.state.selectedDay.clone(), this.calendarOffset(), false);
            // }}
            />
          </ScrollView>
        </Animated.View>
        <View style={this.styles.reservations}>
          {this.renderReservations()}
        </View>
        {/* <TouchableOpacity onPress={this.handleToggle} style={{ position: 'absolute', bottom: 0 }}>
          <Text>collapse</Text>
        </TouchableOpacity> */}
        {/* <Animated.ScrollView
          ref={c => this.scrollPad = c}
          overScrollMode='never'
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          style={scrollPadStyle}
          scrollEventThrottle={1}
          scrollsToTop={false}
          onTouchStart={this.onTouchStart}
          onTouchEnd={this.onTouchEnd}
          onScrollBeginDrag={this.onStartDrag}
          onScrollEndDrag={this.onSnapAfterDrag}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: this.state.scrollY } } }],
            // { useNativeDriver: true },
          )}
        >
          <View style={{ height: agendaHeight + KNOB_HEIGHT }} onLayout={this.onScrollPadLayout} />
        </Animated.ScrollView> */}
      </View>
    );
  }
}
