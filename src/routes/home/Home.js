import React, { PropTypes } from 'react';
import withStyles from 'isomorphic-style-loader/lib/withStyles';
import s from './Home.css';

class Home extends React.Component {

  render() {
    return (
      <div className={s.root}>
        <div className={s.container}>
          <h1>Hello</h1>
        </div>
      </div>
    );
  }
}

export default withStyles(s)(Home);
