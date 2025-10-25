from flask import Flask

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'hackathon'

    from .routes import routes
    app.register_blueprint(routes , url_prefix = '/')

    return app
