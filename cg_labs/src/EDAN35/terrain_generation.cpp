#include "terrain_generation.hpp"
#include "parametric_shapes.hpp"

#include "config.hpp"
#include "core/Bonobo.h"
#include "core/FPSCamera.h"
#include "core/node.hpp"
#include "core/ShaderProgramManager.hpp"
#include <imgui.h>

#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>

#include <array>
#include <clocale>
#include <cstdlib>
#include <stdexcept>



edan35::TerrainGenerator::TerrainGenerator(WindowManager& windowManager) :
	mCamera(0.5f * glm::half_pi<float>(),
		static_cast<float>(config::resolution_x) / static_cast<float>(config::resolution_y),
		0.01f, 1000.0f),
	inputHandler(), mWindowManager(windowManager), window(nullptr)
{
	WindowManager::WindowDatum window_datum{ inputHandler, mCamera, config::resolution_x, config::resolution_y, 0, 0, 0, 0 };

	window = mWindowManager.CreateGLFWWindow("EDAF80: Assignment 2", window_datum, config::msaa_rate);
	if (window == nullptr) {
		throw std::runtime_error("Failed to get a window: aborting!");
	}

	bonobo::init();
}

edan35::TerrainGenerator::~TerrainGenerator()
{
	bonobo::deinit();
}

void
edan35::TerrainGenerator::run()
{
	std::cout << glGetString(GL_RENDERER) << "\n";
	std::cout << glGetString(GL_VENDOR) << "\n";
	// Set up the camera
	mCamera.mWorld.SetTranslate(glm::vec3(0.0f, 50.0f, 0.0f));
	mCamera.mWorld.LookAt(glm::vec3(0.0f));
	mCamera.mMouseSensitivity = glm::vec2(0.003f);
	mCamera.mMovementSpeed = glm::vec3(10.0f); // 3 m/s => 10.8 km/h

	// Create the shader programs
	ShaderProgramManager program_manager;
	GLuint fallback_shader = 0u;
	program_manager.CreateAndRegisterProgram("Fallback",
		{ { ShaderType::vertex, "common/fullscreen.vert" },
		  { ShaderType::fragment, "common/fallback.frag" } },
		fallback_shader);
	if (fallback_shader == 0u) {
		LogError("Failed to load fallback shader");
		return;
	}

	GLuint ray_marching_shader = 0u;
	program_manager.CreateAndRegisterProgram("Ray Marching",
		{ { ShaderType::vertex, "EDAN35/ray_marching.vert"},
		  { ShaderType::fragment, "EDAN35/ray_marching.frag"} },
		ray_marching_shader);
	if (ray_marching_shader == 0u)
		LogError("Failed to load ray_marching shader");


	// -- Uniforms 
	bool use_lighting_position = true;
	glm::vec3 light_position = glm::vec3(0.0f, 100.0f, 0.0f);

	// Calculate light direction from azimuth and elevation
	float azimuth_sun_degrees = 75.0f;
	float elevation_degrees = 20.0f;
	float azimuth_radians = glm::radians(azimuth_sun_degrees);
	float elevation_radians = glm::radians(elevation_degrees);
	glm::vec3 light_direction = glm::normalize(glm::vec3(
		glm::cos(azimuth_radians) * glm::cos(elevation_radians),
		glm::sin(elevation_radians),
		glm::sin(azimuth_radians) * glm::cos(elevation_radians)
	));

	glm::vec3 camera_position = mCamera.mWorld.GetTranslation();
	glm::vec3 camera_front = glm::normalize(mCamera.mWorld.GetFront());
	glm::vec3 camera_right = glm::normalize(mCamera.mWorld.GetRight());
	glm::vec3 camera_up = glm::normalize(mCamera.mWorld.GetUp());

	float atmosphere_dimming = 0.0005f;
	

	float terrain_scale = 0.007f;
	int terrain_octaves = 12;
	int binary_search_depth = 6;
	int   max_steps    = 1000;
	float max_distance = 1000.0;
	float min_step     = 0.100;
	float max_step     = 2.500;

	// -- Light Source Ranges 
	float MIN_X = -100.0, MAX_X = 100.0;
	float MIN_Y = 100.0, MAX_Y = 1000.0;
	float MIN_Z = -100.0, MAX_Z = 100.0;

	auto const set_uniforms = [
		&use_lighting_position, &light_position, &light_direction,
		&camera_position, &camera_front, &camera_right, &camera_up,
		&atmosphere_dimming,
		&terrain_octaves, &binary_search_depth, &terrain_scale,
		&max_steps, &max_distance,
		&min_step, &max_step
	] (GLuint program) {
			glUniform1i(glGetUniformLocation(program, "use_lighting_position"), use_lighting_position);
			glUniform3fv(glGetUniformLocation(program, "light_position"), 1, glm::value_ptr(light_position));
			glUniform3fv(glGetUniformLocation(program, "light_direction"), 1, glm::value_ptr(light_direction));
			glUniform3fv(glGetUniformLocation(program, "camera_position"), 1, glm::value_ptr(camera_position));
			glUniform3fv(glGetUniformLocation(program, "camera_front"), 1, glm::value_ptr(camera_front));
			glUniform3fv(glGetUniformLocation(program, "camera_right"), 1, glm::value_ptr(camera_right));
			glUniform3fv(glGetUniformLocation(program, "camera_up"), 1, glm::value_ptr(camera_up));
			glUniform1i(glGetUniformLocation(program, "octaves"), terrain_octaves);
			glUniform1f(glGetUniformLocation(program, "atmosphere_dimming"), atmosphere_dimming);
			glUniform1f(glGetUniformLocation(program, "terrain_scale"), terrain_scale);
			glUniform1i(glGetUniformLocation(program, "binary_search_depth"), binary_search_depth);
			glUniform1i(glGetUniformLocation(program, "max_steps"), max_steps);
			glUniform1f(glGetUniformLocation(program, "max_distance"), max_distance);
			glUniform1f(glGetUniformLocation(program, "min_step"), min_step);
			glUniform1f(glGetUniformLocation(program, "max_step"), max_step);
	};


	// Create Screen
	auto const fullscreen_quad = parametric_shapes::createQuad(0.0f, 0.0f, 1u, 1u);
	auto ray_marching = Node();
	ray_marching.set_geometry(fullscreen_quad);
	ray_marching.set_program(&ray_marching_shader, set_uniforms);



	glClearDepthf(1.0f);
	glClearColor(0.1f, 0.1f, 0.1f, 1.0f);
	glEnable(GL_DEPTH_TEST);
	glEnable(GL_CULL_FACE);

	bool teleport_to_50k = false;
	bool is_sun_time_moving = false;
	float sun_speed_degrees_per_second = 25.0f;
	float sun_elevation_direction = 1.0f;

	auto lastTime = std::chrono::high_resolution_clock::now();

	std::int32_t program_index = 0;


	auto cull_mode = bonobo::cull_mode_t::disabled;
	auto polygon_mode = bonobo::polygon_mode_t::fill;
	bool show_logs = true;
	bool show_gui = true;

	changeCullMode(cull_mode);

	while (!glfwWindowShouldClose(window)) {
		auto const now = std::chrono::high_resolution_clock::now();
		auto const delta_time_us = std::chrono::duration_cast<std::chrono::microseconds>(now - lastTime);
		lastTime = now;

		auto& io = ImGui::GetIO();
		inputHandler.SetUICapture(io.WantCaptureMouse, io.WantCaptureKeyboard);

		glfwPollEvents();
		inputHandler.Advance();
		mCamera.Update(delta_time_us, inputHandler);

		if (inputHandler.GetKeycodeState(GLFW_KEY_F3) & JUST_RELEASED)
			show_logs = !show_logs;
		if (inputHandler.GetKeycodeState(GLFW_KEY_F2) & JUST_RELEASED)
			show_gui = !show_gui;
		if (inputHandler.GetKeycodeState(GLFW_KEY_F11) & JUST_RELEASED)
			mWindowManager.ToggleFullscreenStatusForWindow(window);


		// Retrieve the actual framebuffer size: for HiDPI monitors,
		// you might end up with a framebuffer larger than what you
		// actually asked for. For example, if you ask for a 1920x1080
		// framebuffer, you might get a 3840x2160 one instead.
		// Also it might change as the user drags the window between
		// monitors with different DPIs, or if the fullscreen status is
		// being toggled.
		int framebuffer_width, framebuffer_height;
		glfwGetFramebufferSize(window, &framebuffer_width, &framebuffer_height);
		glViewport(0, 0, framebuffer_width, framebuffer_height);

		mWindowManager.NewImGuiFrame();


		glClear(GL_DEPTH_BUFFER_BIT | GL_COLOR_BUFFER_BIT);
		bonobo::changePolygonMode(polygon_mode);

		camera_position = mCamera.mWorld.GetTranslation();
		camera_front = glm::normalize(mCamera.mWorld.GetFront());
		camera_right = glm::normalize(mCamera.mWorld.GetRight());
		camera_up = glm::normalize(mCamera.mWorld.GetUp());


		// -- Time calculations
		const auto delta_microseconds = delta_time_us.count();
		const float delta_time_seconds = static_cast<float>(delta_microseconds) * 1e-6f;
		const float delta_time_milliseconds = static_cast<float>(delta_microseconds) * 1e-3f;

		const float frames_per_second =
			(delta_microseconds > 0)
			? (1e6f / static_cast<float>(delta_microseconds))
			: 0.0f;

		if (!use_lighting_position) {
			azimuth_radians = glm::radians(azimuth_sun_degrees);
			elevation_radians = glm::radians(elevation_degrees);
			light_direction = glm::normalize(glm::vec3(
				glm::cos(azimuth_radians) * glm::cos(elevation_radians),
				glm::sin(elevation_radians),
				glm::sin(azimuth_radians) * glm::cos(elevation_radians)
			));
		}

		if (teleport_to_50k) {
			mCamera.mWorld.SetTranslate(glm::vec3(5e5f, 300.0f, 5e5f));
			teleport_to_50k = false;

		}
		// For Light Direction
		if (is_sun_time_moving) {
			elevation_degrees += sun_elevation_direction * sun_speed_degrees_per_second * delta_time_seconds;
			// Simple sun movement model: reverse direction when reaching zenith or horizon
			if (elevation_degrees >= 90.0f) {
				elevation_degrees = 90.0f;
				azimuth_sun_degrees += (azimuth_sun_degrees + 180.0f) <= 360.0f ? 180.0f : -180.0f;
				sun_elevation_direction = -1.0f;
			}
			else if (elevation_degrees <= 0.0f) {
				elevation_degrees = 0.0f;
				sun_elevation_direction = 1.0f;
			}
		}

		// Render Screen
		ray_marching.render(mCamera.GetWorldToClipMatrix());


		bool const opened = ImGui::Begin("Scene Controls", nullptr, ImGuiWindowFlags_None);
		if (opened) {
			auto const cull_mode_changed = bonobo::uiSelectCullMode("Cull mode", cull_mode);
			if (cull_mode_changed) {
				changeCullMode(cull_mode);
			}
			bonobo::uiSelectPolygonMode("Polygon mode", polygon_mode);
			auto selection_result = program_manager.SelectProgram("Shader", program_index);
			if (selection_result.was_selection_changed) {
				ray_marching.set_program(selection_result.program, set_uniforms);
			}
			ImGui::Separator();
			ImGui::Text("Frame: %.3f ms (%.1f FPS)", delta_time_milliseconds, frames_per_second);
			ImGui::Text("Camera Position: (%.2f, %.2f, %.2f)", camera_position.x, camera_position.y, camera_position.z);
			ImGui::Checkbox("Teleport to 50k", &teleport_to_50k);

			ImGui::Separator();
			ImGui::Text("Light & Sky");
			ImGui::Checkbox("Use Light Position", &use_lighting_position);
			ImGui::SliderFloat("Light X value", &light_position[0], MIN_X, MAX_X);
			ImGui::SliderFloat("Light Y value", &light_position[1], MIN_Y, MAX_Y);
			ImGui::SliderFloat("Light Z value", &light_position[2], MIN_Z, MAX_Z);
			ImGui::Checkbox("Sun Moving", &is_sun_time_moving);
			ImGui::SliderFloat("Sun azimuth (deg)", &azimuth_sun_degrees, 0.0f, 360.0f);
			ImGui::SliderFloat("Sun elevation (deg)", &elevation_degrees, -5.0f, 90.0f);
			ImGui::SliderFloat("Atmosphere dimming", &atmosphere_dimming, 0.0f, 0.008f);
			ImGui::Separator();
			ImGui::Text("Terrain");
			ImGui::SliderFloat("Scaling", &terrain_scale, 0.004f, 0.012f);
			ImGui::SliderInt("Octaves", &terrain_octaves, 1, 15);
			ImGui::SliderInt("Binary Search", &binary_search_depth, 0, 10);
			ImGui::SliderInt("Max Steps", &max_steps, 100, 2000);
			ImGui::SliderFloat("Max Distance", &max_distance, 1000.0f, 1e5f);
			ImGui::SliderFloat("Min Step", &min_step, 0.0050f, 0.1000f);
			ImGui::SliderFloat("Max Step", &max_step, 0.1f, 20.0f);
		}
		ImGui::End();

		glPolygonMode(GL_FRONT_AND_BACK, GL_FILL);

		//if (show_logs)
			//Log::View::Render();
		mWindowManager.RenderImGuiFrame(show_gui);

		glfwSwapBuffers(window);
	}
}

int main()
{
	std::setlocale(LC_ALL, "");

	Bonobo framework;

	try {
		edan35::TerrainGenerator terrain_generator(framework.GetWindowManager());
		terrain_generator.run();
	}
	catch (std::runtime_error const& e) {
		LogError(e.what());
	}
}
