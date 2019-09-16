export default function platformStyles(appStyle) {
  return {
    knob: {
      width: 38,
      height: 7,
      borderRadius: 3,
      backgroundColor: appStyle.agendaKnobColor
    },
    weekdays: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
      zIndex: 1,
      paddingLeft: 24,
      paddingRight: 24,
      paddingTop: 8,
      backgroundColor: appStyle.calendarBackground
    },
  };
}
