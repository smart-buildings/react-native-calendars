import { StyleSheet } from 'react-native';
import * as defaultStyle from '../style';
import platformStyles from './platform-style';

const STYLESHEET_ID = 'stylesheet.agenda.main';

export default function styleConstructor(theme = {}) {
  const appStyle = { ...defaultStyle, ...theme };
  const { knob, weekdays } = platformStyles(appStyle);
  return StyleSheet.create({
    knob,
    weekdays,
    header: {
      // overflow: 'hidden',
      // justifyContent: 'flex-end',
      // position: 'absolute',
      // height: '100%',
      width: '100%',
    },
    calendar: { // not in use
      flex: 1,
      borderBottomWidth: 1,
      borderColor: appStyle.separatorColor
    },
    knobContainer: {
      flexDirection: 'row',
      backgroundColor: appStyle.calendarBackground,
      paddingBottom: 4,
      bottom: 0,
      width: '100%',
      justifyContent: 'space-between',
      alignItems: 'center',
      height: 24,
      zIndex: 1,
      position: 'absolute',
    },
    weekday: {
      width: 32,
      textAlign: 'center',
      color: appStyle.textSectionTitleColor,
      fontSize: appStyle.textDayHeaderFontSize,
      fontFamily: appStyle.textDayHeaderFontFamily,
      fontWeight: appStyle.textDayHeaderFontWeight
    },
    reservations: {
      flex: 1,
      // marginTop: 104,
      // backgroundColor: appStyle.backgroundColor,
    },
    smallAction: {
      position: 'absolute',
      bottom: 0,
      height: 33,
      backgroundColor: 'white',
      left: 0,
      right: 0,
      zIndex: 3,
    },
    ...(theme[STYLESHEET_ID] || {})
  });
}
