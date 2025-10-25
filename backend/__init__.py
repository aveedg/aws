from flask import Flask

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'hackathon'

    # Import and register the blueprint here
    from .routes import routes
    app.register_blueprint(routes, url_prefix='/')  # Register the blueprint

    return app